// Run: node --test worker/test/*.test.js
// dorrance.me accounts: the Worker side (worker/auth.js) run in Node with KV in memory, and the page side
// (shared/account.js) against it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const makeApi = require('./harness.cjs');
const Account = require('../../shared/account.js');

const FILE = fs.readFileSync(path.join(__dirname, '..', '..', 'recipes', 'recipes.json'), 'utf8');

// Calls to /api/auth/ as a page makes them. `ip` is the address the request comes from.
function client(api, ip = '1.1.1.1') {
  const send = async (method, p, { token, body } = {}) => {
    const headers = { 'cf-connecting-ip': ip };
    if (token) headers.authorization = 'Bearer ' + token;
    const res = await api.call('http://x/api/auth/' + p, { method, headers, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return {
    send,
    signup: (name, password) => send('POST', 'signup', { body: { name, password } }),
    login: (name, password) => send('POST', 'login', { body: { name, password } })
  };
}
const kvText = api => [...api.kv.m.entries()].map(([k, v]) => k + ' ' + v.value).join('\n');

test('a new account waits for the admin, then can sign in', async () => {
  const api = await makeApi(FILE), c = client(api);
  assert.deepEqual(await c.signup('  Megan ', 'pasta-night-42'), { status: 201, body: { name: 'Megan', admin: 'Mitchell' } });
  const u = await api.kv.get('auth:user:megan', 'json');
  assert.equal(u.status, 'pending');
  assert.match(u.hash, /^[0-9a-f]{64}$/);
  assert.ok(!kvText(api).includes('pasta-night-42'), 'the password is not kept as typed');
  assert.deepEqual(await c.login('megan', 'pasta-night-42'), { status: 403, body: { error: 'waiting' } });

  const admin = (await c.login('MITCHELL', api.ADMIN_PASSWORD)).body;
  assert.equal(admin.name, 'Mitchell');
  assert.equal(admin.admin, true);
  assert.deepEqual((await c.send('GET', 'me', { token: admin.token })).body, { name: 'Mitchell', admin: true, waiting: 1 });
  const list = (await c.send('GET', 'users', { token: admin.token })).body.users;
  assert.deepEqual(list.map(x => [x.key, x.name, x.status]), [['megan', 'Megan', 'pending']]);
  assert.equal((await c.send('POST', 'users/megan/approve', { token: admin.token })).status, 200);

  const megan = await c.login('Megan', 'pasta-night-42');
  assert.equal(megan.status, 200);
  assert.deepEqual((await c.send('GET', 'me', { token: megan.body.token })).body, { name: 'Megan', admin: false, waiting: 0 });
  assert.ok(!kvText(api).includes(megan.body.token) && !kvText(api).includes(admin.token), 'KV never holds a sign-in that works');
});

test('names and passwords are checked', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  for (const name of ['', 'a', '<b>Jo</b>', 'x'.repeat(25), ' -Jo']) assert.deepEqual(await c.signup(name, 'long-enough'), { status: 400, body: { error: 'name' } }, name);
  assert.deepEqual(await c.signup('Jo', 'short'), { status: 400, body: { error: 'password' } });
  assert.deepEqual(await c.signup('MADI', 'long-enough'), { status: 409, body: { error: 'taken' } });
  assert.deepEqual(await c.signup('mitchell', 'long-enough'), { status: 409, body: { error: 'taken' } }, 'no one can take the admin name');
  assert.equal((await c.signup("Jo O'Neil-Smith", 'long-enough')).status, 201);
  assert.deepEqual(await c.login('Madi', 'wrong-password'), { status: 401, body: { error: 'wrong' } });
  assert.deepEqual(await c.login('Nobody', 'madi-password'), { status: 401, body: { error: 'wrong' } });
  assert.deepEqual(await c.login('Mitchell', 'madi-password'), { status: 401, body: { error: 'wrong' } });
});

test('names start with a capital, also accounts made before that', async () => {
  const api = await makeApi(FILE), c = client(api);
  assert.deepEqual((await c.signup('hayden smith', 'long-enough')).body, { name: 'Hayden Smith', admin: 'Mitchell' });
  assert.equal((await api.kv.get('auth:user:hayden smith', 'json')).name, 'Hayden Smith');
  // An older account, saved as typed
  const old = await api.kv.get('auth:user:hayden smith', 'json');
  await api.kv.put('auth:user:hayden smith', JSON.stringify({ ...old, name: 'hayden smith', status: 'approved' }), { metadata: { name: 'hayden smith', status: 'approved', created: old.created } });
  const h = (await c.login('HAYDEN SMITH', 'long-enough')).body;
  assert.equal(h.name, 'Hayden Smith');
  assert.equal((await c.send('GET', 'me', { token: h.token })).body.name, 'Hayden Smith');
  const admin = (await c.login('Mitchell', api.ADMIN_PASSWORD)).body;
  assert.deepEqual((await c.send('GET', 'users', { token: admin.token })).body.users.map(x => x.name), ['Hayden Smith']);
  assert.equal((await c.signup("jo o'Neil", 'long-enough')).body.name, "Jo O'Neil", 'only the start of each word changes');
});

test('too many tries lock one address for a while', async () => {
  const api = await makeApi(FILE), c = client(api, '9.9.9.9');
  await api.addUser('Madi', 'madi-password');
  for (let i = 0; i < 8; i++) assert.equal((await c.login('Madi', 'guess-' + i)).status, 401);
  assert.deepEqual(await c.login('Madi', 'madi-password'), { status: 429, body: { error: 'tries' } });
  assert.deepEqual(await c.signup('Spam', 'long-enough'), { status: 429, body: { error: 'tries' } });
  assert.equal((await client(api, '2.2.2.2').login('Madi', 'madi-password')).status, 200, 'another address still works');
});

test('only the admin sees and changes accounts', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  await api.addUser('Jen', 'jen-password', true);
  const madi = (await c.login('Madi', 'madi-password')).body.token;
  assert.deepEqual(await c.send('GET', 'users', { token: madi }), { status: 403, body: { error: 'admin' } });
  assert.deepEqual(await c.send('POST', 'users/jen/approve', { token: madi }), { status: 403, body: { error: 'admin' } });
  assert.deepEqual(await c.send('DELETE', 'users/jen', { token: madi }), { status: 403, body: { error: 'admin' } });
  assert.deepEqual(await c.send('GET', 'users'), { status: 401, body: { error: 'signin' } });
  assert.deepEqual(await c.send('GET', 'users', { token: 'x'.repeat(43) }), { status: 401, body: { error: 'signin' } });
  assert.equal((await api.kv.get('auth:user:jen', 'json')).status, 'pending');
});

test('removing an account ends its sign-in, also when someone takes the name again', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  const madi = (await c.login('Madi', 'madi-password')).body.token;
  const admin = (await c.login('Mitchell', api.ADMIN_PASSWORD)).body.token;
  assert.equal((await c.send('GET', 'me', { token: madi })).status, 200);
  assert.equal((await c.send('DELETE', 'users/madi', { token: admin })).status, 200);
  assert.deepEqual(await c.send('GET', 'me', { token: madi }), { status: 401, body: { error: 'signin' } });
  assert.deepEqual(await c.send('DELETE', 'users/madi', { token: admin }), { status: 404, body: { error: 'nobody' } });
  await api.addUser('Madi', 'another-password');
  assert.equal((await c.send('GET', 'me', { token: madi })).status, 401);
});

test('sign out, and a new admin password, end a sign-in', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  const madi = (await c.login('Madi', 'madi-password')).body.token;
  assert.equal((await c.send('POST', 'logout', { token: madi })).status, 200);
  assert.equal((await c.send('GET', 'me', { token: madi })).status, 401);
  const admin = (await c.login('Mitchell', api.ADMIN_PASSWORD)).body.token;
  api.env.ADMIN_PASSWORD = 'a-new-admin-password';
  assert.equal((await c.send('GET', 'me', { token: admin })).status, 401);
  delete api.env.ADMIN_PASSWORD;
  assert.deepEqual(await c.login('Mitchell', ''), { status: 503, body: { error: 'setup' } });
});

test('one sign-in works on every route: Recipes saves take it too', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  const madi = (await c.login('Madi', 'madi-password')).body.token;
  const res = await api.call('http://x/api/recipes/file', { headers: { authorization: 'Bearer ' + madi } });
  assert.equal(res.status, 200);
});

test('the TV Mount library is still there', async () => {
  const api = await makeApi(FILE);
  const res = await api.call('http://x/api/tvmount/lib');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { tvs: [], mounts: [] });
});

/* ---- shared/account.js, the page side ---- */
// localStorage as a page has it on dorrance.me.
function phone() {
  const m = new Map();
  globalThis.localStorage = { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  return m;
}

test('Account: sign in, keep the sign-in for every page, sign out here and on the Worker', async () => {
  const api = await makeApi(FILE), store = phone();
  await api.addUser('Madi', 'madi-password');
  assert.equal(Account.session(), null);
  assert.deepEqual(Account.headers(), {});
  await assert.rejects(Account.signIn('Madi', 'wrong-password'), e => e.code === 'wrong' && e.message === 'That name and password do not match.');
  const s = await Account.signIn('madi', 'madi-password');
  assert.deepEqual(JSON.parse(store.get('dorrance-session')), { token: s.token, name: 'Madi', admin: false });
  assert.deepEqual(Account.session(), { token: s.token, name: 'Madi', admin: false });
  assert.deepEqual(Account.headers(), { Authorization: 'Bearer ' + s.token });
  assert.deepEqual(await Account.mine().me(), { name: 'Madi', admin: false, waiting: 0 });
  Account.signOut();
  assert.equal(store.has('dorrance-session'), false);
  await new Promise(r => setTimeout(r, 50));
  assert.equal((await api.call('http://x/api/auth/me', { headers: { authorization: 'Bearer ' + s.token } })).status, 401);
});

test('Account: the admin approves, denies and removes', async () => {
  const api = await makeApi(FILE);
  phone();
  await api.addUser('Madi', 'madi-password');
  assert.deepEqual(await Account.api().signup('Megan', 'pasta-night-42'), { name: 'Megan', admin: 'Mitchell' });
  await assert.rejects(Account.api().signup('Megan', 'pasta-night-42'), e => e.code === 'taken');
  await assert.rejects(Account.api().login('Megan', 'pasta-night-42'), e => e.code === 'waiting' && e.message === 'Your account is waiting for approval.');
  await Account.signIn('Mitchell', api.ADMIN_PASSWORD);
  assert.deepEqual((await Account.mine().users()).map(u => u.name + ':' + u.status), ['Megan:pending', 'Madi:approved']);
  await Account.mine().approve('megan');
  await Account.mine().remove('madi');
  await assert.rejects(Account.mine().remove('madi'), e => e.code === 'nobody');
  assert.deepEqual((await Account.mine().users()).map(u => u.name + ':' + u.status), ['Megan:approved']);
  await assert.rejects(Account.api(null, async () => { throw new TypeError('Load failed'); }).me(), e => e.code === 'network' && e.message === 'No connection.');
});
