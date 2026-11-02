/* dorrance.me accounts, for every app on the site. index.js sends /api/auth/* here, and other routes call who() to
   see who is signed in. docs/accounts.md tells how to use the accounts in an app.
   Anyone can ask for an account. The admin approves it. The admin is the var ADMIN with the secret ADMIN_PASSWORD.

   POST   /api/auth/signup            { name, password }  -> 201 { name, admin }       (anyone)
   POST   /api/auth/login             { name, password }  -> { token, name, admin }    (anyone)
   GET    /api/auth/me                                    -> { name, admin, waiting }  (signed in)
   POST   /api/auth/logout                                -> { ok }                    (signed in)
   GET    /api/auth/users                                 -> { users }                 (admin)
   POST   /api/auth/users/KEY/approve                     -> { ok }                    (admin)
   DELETE /api/auth/users/KEY                             -> { ok }                    (admin)

   A signed-in request has the header "Authorization: Bearer TOKEN". An error is { error: CODE } with a status;
   shared/account.js has the words for each code.
   KV (the LIB binding) keeps:
     auth:user:KEY     { id, name, salt, hash, status: 'pending' | 'approved', created }, and { name, status, created }
                       as metadata for the list. KEY is the name in lower case.
     auth:session:SHA  { key, id } or { key, admin, pw } for a year. SHA is the SHA-256 of the token, so KV never holds
                       a token that works. A removed account, or a new admin password, ends its sessions.
     auth:tries:IP     failed sign-ins and new accounts from one address in the last 15 minutes. */
const USER = 'auth:user:', SESSION = 'auth:session:', TRIES = 'auth:tries:';
const YEAR = 365 * 24 * 3600, WINDOW = 15 * 60, MAX_TRIES = 8, MAX_WAITING = 25;
const ROUNDS = 50000;   // PBKDF2 rounds: slow to guess, and still well inside a Worker's CPU time

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const random = n => crypto.getRandomValues(new Uint8Array(n));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bytes = Uint8Array.from(salt.match(/../g), h => parseInt(h, 16));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes, iterations: ROUNDS }, key, 256));
}
// Two hex strings compared in constant time.
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// The name as typed, tidied: 2 to 24 letters, numbers, spaces and . ' _ -, starting with a letter or number.
function cleanName(s) {
  const name = String(s || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  return /^[\p{L}\p{N}][\p{L}\p{N} .'’_-]{1,23}$/u.test(name) ? nice(name) : null;
}
// Each word starts with a capital ("hayden" shows as "Hayden"). Accounts made before this keep their name as typed
// in KV, so every name read from KV goes through it too.
export const nice = name => String(name).replace(/(^| )(\p{Ll})/gu, (_, a, b) => a + b.toUpperCase());
export const keyOf = name => name.toLowerCase();
export const adminName = env => cleanName(env.ADMIN) || 'Mitchell';
const isAdminName = (env, name) => keyOf(name) === keyOf(adminName(env));

async function body(req) {
  try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; }
}
const triesKey = req => TRIES + (req.headers.get('cf-connecting-ip') || 'local');
const tries = async (env, req) => +(await env.LIB.get(triesKey(req))) || 0;
async function tried(env, req) {
  await env.LIB.put(triesKey(req), String(await tries(env, req) + 1), { expirationTtl: WINDOW });
}

export async function users(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.LIB.list({ prefix: USER, cursor });
    for (const k of page.keys) out.push({ key: k.name.slice(USER.length), ...k.metadata, name: nice(k.metadata?.name || '') });
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}
const saveUser = (env, key, u) => env.LIB.put(USER + key, JSON.stringify(u), { metadata: { name: u.name, status: u.status, created: u.created } });

// The person signed in on this request, { sid, key, id, name, admin }, or null. Only approved accounts and the admin
// sign in. `key` is the account's KV key; `id` changes when an account is removed and its name is taken again.
export async function who(req, env) {
  const m = /^Bearer ([\w-]{20,100})$/.exec(req.headers.get('authorization') || '');
  if (!m) return null;
  const sid = await sha256(m[1]);
  const s = await env.LIB.get(SESSION + sid, 'json');
  if (!s) return null;
  if (s.admin) {
    const ok = env.ADMIN_PASSWORD && s.key === keyOf(adminName(env)) && s.pw === await sha256('pw:' + env.ADMIN_PASSWORD);
    return ok ? { sid, key: s.key, name: adminName(env), admin: true } : null;
  }
  const u = await env.LIB.get(USER + s.key, 'json');
  return u && u.id === s.id && u.status === 'approved' ? { sid, key: s.key, id: u.id, name: nice(u.name), admin: false } : null;
}

async function signup(req, env) {
  if (await tries(env, req) >= MAX_TRIES) return json({ error: 'tries' }, 429);
  const { name, password } = await body(req);
  const n = cleanName(name);
  if (!n) return json({ error: 'name' }, 400);
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) return json({ error: 'password' }, 400);
  const key = keyOf(n);
  if (isAdminName(env, n) || await env.LIB.get(USER + key)) return json({ error: 'taken' }, 409);
  if ((await users(env)).filter(u => u.status === 'pending').length >= MAX_WAITING) return json({ error: 'full' }, 429);
  await tried(env, req);   // a new account counts as a try, so one address cannot ask for many
  const salt = hex(random(16));
  await saveUser(env, key, { id: hex(random(8)), name: n, salt, hash: await pbkdf2(password, salt), status: 'pending', created: new Date().toISOString().slice(0, 10) });
  return json({ name: n, admin: adminName(env) }, 201);
}

async function login(req, env) {
  if (await tries(env, req) >= MAX_TRIES) return json({ error: 'tries' }, 429);
  const { name, password } = await body(req);
  const n = cleanName(name), pw = typeof password === 'string' ? password : '';
  let session = null, shown;
  if (n && isAdminName(env, n)) {
    if (!env.ADMIN_PASSWORD) return json({ error: 'setup' }, 503);
    if (same(await sha256(pw), await sha256(env.ADMIN_PASSWORD))) {
      session = { key: keyOf(n), admin: true, pw: await sha256('pw:' + env.ADMIN_PASSWORD) };
      shown = adminName(env);
    }
  } else if (n) {
    const u = await env.LIB.get(USER + keyOf(n), 'json');
    if (u && same(await pbkdf2(pw, u.salt), u.hash)) {
      if (u.status !== 'approved') return json({ error: 'waiting' }, 403);
      session = { key: keyOf(n), id: u.id };
      shown = nice(u.name);
    }
  }
  if (!session) { await tried(env, req); return json({ error: 'wrong' }, 401); }
  const token = btoa(String.fromCharCode(...random(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await env.LIB.put(SESSION + await sha256(token), JSON.stringify(session), { expirationTtl: YEAR });
  return json({ token, name: shown, admin: !!session.admin });
}

export async function auth(req, env, url) {
  const path = url.pathname.replace(/^\/api\/auth\/?/, '').replace(/\/$/, '');
  if (path === 'signup' && req.method === 'POST') return signup(req, env);
  if (path === 'login' && req.method === 'POST') return login(req, env);

  const me = await who(req, env);
  if (!me) return json({ error: 'signin' }, 401);
  if (path === 'me' && req.method === 'GET') {
    const waiting = me.admin ? (await users(env)).filter(u => u.status === 'pending').length : 0;
    return json({ name: me.name, admin: me.admin, waiting });
  }
  if (path === 'logout' && req.method === 'POST') { await env.LIB.delete(SESSION + me.sid); return json({ ok: true }); }

  const m = /^users(?:\/([^/]+)(\/approve)?)?$/.exec(path);
  if (!m) return json({ error: 'not found' }, 404);
  if (!me.admin) return json({ error: 'admin' }, 403);
  if (!m[1] && req.method === 'GET') {
    const list = (await users(env)).sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || a.name.localeCompare(b.name));
    return json({ users: list });
  }
  let key;
  try { key = decodeURIComponent(m[1] || ''); } catch { return json({ error: 'nobody' }, 404); }
  const u = key && await env.LIB.get(USER + key, 'json');
  if (!u) return json({ error: 'nobody' }, 404);
  if (m[2] && req.method === 'POST') { await saveUser(env, key, { ...u, status: 'approved' }); return json({ ok: true }); }
  if (!m[2] && req.method === 'DELETE') { await env.LIB.delete(USER + key); return json({ ok: true }); }
  return json({ error: 'method' }, 405);
}
