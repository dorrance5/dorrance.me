/* The cars for dorrance.me/roadtrip. index.js sends /api/roadtrip and /api/roadtrip/* here.
   Everyone signed in has a household of their own: their cars with the fill-ups, costs and reminders of each. People
   can share one household, up to 6: someone in it asks, and the other says yes. No one else can read a household, the
   admin included. The cars are private, so they live in KV and not in the public GitHub repository.
   roadtrip/data.js has the data and the ops, and the page uses the same file.

   GET  /api/roadtrip                             -> the answer, { people, cars, share }
   POST /api/roadtrip         { ops }             -> the answer, after the ops
   GET  /api/roadtrip/people                      -> { people: [{ key, name }] }: everyone who can be asked
   POST /api/roadtrip/share   { do: 'ask', key }  -> the answer: ask someone to share your household
                              { do: 'cancel' }       take your ask back
                              { do: 'join' }         say yes to the ask you got: your cars come along when you are on
                                                     your own; a household you share now keeps its cars
                              { do: 'decline' }      say no
                              { do: 'leave' }        stop sharing: the others keep the cars, and you keep a copy
   All of them need a sign-in. In the answer, `people` are the names in the household (you first), and `share` is
   { with: [{ key, name }], invite, asked }: the others in it, who asked you, and who you asked, each { key, name } or null.

   KV (the LIB binding) keeps:
     road:home:ID  { members: [{ key, id, name }], cars }. Your own household's ID is solo.KEY.ID; a shared one gets a
                   new random ID.
     road:me:KEY   { id, home, invite, asked }: your shared household, who asked you, and who you asked. Only someone
                   who shares, asks or was asked has one.
   An account's id tells it apart from a removed account that had the same name; the admin's id is 'admin'.
   A GET only reads, and so does /people (a KV list). A POST of ops is one read and one write. Asking, saying yes and
   leaving are a few writes. KV takes one write a second to one key: a write that meets another answers 429
   { error: 'busy' }, and the page sends again. Over the day's free writes, it answers 503 { error: 'full' }. */
import T from '../roadtrip/data.js';
import { json, who, users, adminName, keyOf } from './auth.js';

const HOME = 'road:home:', ME = 'road:me:', USER = 'auth:user:';
const CROWD = 6;   // people in one household
const randomId = () => 'h' + [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');

async function body(req, max) {
  const text = await req.text().catch(() => '');
  if (text.length > max) return null;
  try { const b = JSON.parse(text); return b && typeof b === 'object' ? b : null; } catch { return null; }
}
// A person is { key, id, name }.
const person = me => ({ key: me.key, id: me.admin ? 'admin' : me.id, name: me.name });
const same = (a, b) => !!a && !!b && a.key === b.key && a.id === b.id;
const shown = p => p ? { key: p.key, name: p.name } : null;
const soloId = p => `solo.${p.key}.${p.id}`;

// The person with this key, if the account can sign in.
async function account(env, key) {
  if (key === keyOf(adminName(env))) return { key, id: 'admin', name: adminName(env) };
  const u = await env.LIB.get(USER + key, 'json');
  return u && u.status === 'approved' ? { key, id: u.id, name: u.name } : null;
}
const alive = async (env, p) => same(await account(env, p.key), p);

// Someone's record. A record left by a removed account with the same name is not theirs.
async function record(env, p) {
  const r = await env.LIB.get(ME + p.key, 'json');
  return r && r.id === p.id ? r : {};
}
const saveRecord = (env, p, r) => r.home || r.invite || r.asked
  ? env.LIB.put(ME + p.key, JSON.stringify({ id: p.id, home: r.home || null, invite: r.invite || null, asked: r.asked || null }))
  : env.LIB.delete(ME + p.key);

// Where someone keeps their cars: { id, home, shared }. A shared household they are no longer in does not count.
async function where(env, p, r) {
  if (r.home) {
    const home = await env.LIB.get(HOME + r.home, { type: 'json', cacheTtl: 30 });
    if (home && Array.isArray(home.members) && home.members.some(m => same(m, p))) return { id: r.home, home, shared: true };
  }
  return { id: soloId(p), home: await env.LIB.get(HOME + soloId(p), { type: 'json', cacheTtl: 30 }), shared: false };
}
// The others in a shared household whose accounts can still sign in.
async function othersIn(env, p, at) {
  if (!at.shared) return [];
  const out = [];
  for (const m of at.home.members) if (!same(m, p) && await alive(env, m)) out.push(m);
  return out;
}
const carsOf = at => T.tidy(at.home).cars;

async function answer(env, me, r, at) {
  const others = await othersIn(env, person(me), at);
  return json({ people: [me.name, ...others.map(m => m.name)], cars: carsOf(at),
    share: { with: others.map(shown), invite: shown(r.invite), asked: shown(r.asked) } });
}

// A KV write that fails: busy (another write to the key this second) or full (the day's free writes are used up).
const refused = e => /limit/i.test(String(e && e.message)) ? json({ error: 'full' }, 503) : json({ error: 'busy' }, 429);

// Someone leaves a shared household. The others keep it; the last one out keeps it as their own.
async function leaveHome(env, p, at) {
  const members = at.home.members.filter(m => !same(m, p));
  if (members.length) await env.LIB.put(HOME + at.id, JSON.stringify({ ...at.home, members }));
  else await env.LIB.delete(HOME + at.id);
  return members.length > 0;
}
// An ask taken back: it goes from the other person's record too.
async function takeBack(env, them, p) {
  const theirs = await record(env, them);
  if (same(theirs.invite, p)) await saveRecord(env, them, { ...theirs, invite: null });
}

async function share(req, env, me, p, r) {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const b = await body(req, 2000);
  const what = b && b.do;
  if (what === 'ask') {
    if (typeof b.key !== 'string' || !b.key || b.key.length > 40 || b.key === p.key) return json({ error: 'body' }, 400);
    const at = await where(env, p, r), others = await othersIn(env, p, at);
    if (others.some(m => m.key === b.key)) return json({ error: 'body' }, 400);   // in the household already
    if (others.length + 2 > CROWD) return json({ error: 'crowd' }, 409);
    const them = await account(env, b.key);
    if (!them) return json({ error: 'nobody' }, 404);
    const theirs = await record(env, them);
    if (theirs.invite && !same(theirs.invite, p)) return json({ error: 'asked' }, 409);
    if (r.asked && !same(r.asked, them)) await takeBack(env, r.asked, p);   // one ask at a time
    await saveRecord(env, them, { ...theirs, invite: p });
    const mine = { ...r, asked: them };
    await saveRecord(env, p, mine);
    return answer(env, me, mine, at);
  }
  if (what === 'cancel') {
    if (r.asked) await takeBack(env, r.asked, p);
    const mine = { ...r, asked: null };
    await saveRecord(env, p, mine);
    return answer(env, me, mine, await where(env, p, mine));
  }
  if (what === 'decline') {
    if (r.invite) {
      const theirs = await record(env, r.invite);
      if (same(theirs.asked, p)) await saveRecord(env, r.invite, { ...theirs, asked: null });
    }
    const mine = { ...r, invite: null };
    await saveRecord(env, p, mine);
    return answer(env, me, mine, await where(env, p, mine));
  }
  if (what === 'join') {
    const from = r.invite;
    if (!from) return json({ error: 'gone' }, 409);
    const theirs = await record(env, from);
    if (!await alive(env, from) || !same(theirs.asked, p)) {   // the account is gone, or the ask was taken back
      await saveRecord(env, p, { ...r, invite: null });
      return json({ error: 'gone' }, 409);
    }
    const there = await where(env, from, theirs), at = await where(env, p, r);
    if (there.shared && there.id === at.id) {   // in it already
      const mine = { ...r, invite: null };
      await saveRecord(env, from, { ...theirs, asked: null });
      await saveRecord(env, p, mine);
      return answer(env, me, mine, at);
    }
    if ((await othersIn(env, from, there)).length + 2 > CROWD) return json({ error: 'crowd' }, 409);
    // On your own, your cars come along. From a shared household, they stay with the others there.
    let carried = [];
    if (at.shared) { if (!await leaveHome(env, p, at)) carried = carsOf(at); }
    else carried = carsOf(at);
    const id = there.shared ? there.id : randomId();
    const members = [...(there.shared ? there.home.members : [from]), p];
    const home = { members, cars: T.tidy({ cars: [...carsOf(there), ...carried] }).cars };
    await env.LIB.put(HOME + id, JSON.stringify(home));
    if (!there.shared && there.home) await env.LIB.delete(HOME + there.id);
    if (!at.shared && at.home) await env.LIB.delete(HOME + at.id);
    await saveRecord(env, from, { ...theirs, home: id, asked: null });
    const mine = { ...r, home: id, invite: null };
    await saveRecord(env, p, mine);
    return answer(env, me, mine, { id, home, shared: true });
  }
  if (what === 'leave') {
    const at = await where(env, p, r);
    if (!at.shared) return answer(env, me, r, at);
    await leaveHome(env, p, at);
    // A copy of the cars stays with you, as your own household.
    await env.LIB.put(HOME + soloId(p), JSON.stringify({ members: [p], cars: carsOf(at) }));
    const mine = { ...r, home: null };
    await saveRecord(env, p, mine);
    return answer(env, me, mine, await where(env, p, mine));
  }
  return json({ error: 'body' }, 400);
}

export async function roadtrip(req, env, url) {
  const path = url.pathname.replace(/^\/api\/roadtrip\/?/, '').replace(/\/$/, '');
  if (path !== '' && path !== 'people' && path !== 'share') return json({ error: 'not found' }, 404);
  const me = await who(req, env);
  if (!me) return json({ error: 'signin' }, 401);
  const p = person(me);

  if (path === 'people') {
    if (req.method !== 'GET') return json({ error: 'method' }, 405);
    const admin = { key: keyOf(adminName(env)), name: adminName(env) };
    const others = (await users(env)).filter(u => u.status === 'approved').map(u => ({ key: u.key, name: u.name }));
    return json({ people: [admin, ...others].filter(x => x.key !== p.key).sort((a, b) => a.name.localeCompare(b.name)) });
  }
  const r = await record(env, p);
  if (path === 'share') {
    try { return await share(req, env, me, p, r); } catch (e) { return refused(e); }
  }

  const at = await where(env, p, r);
  if (req.method === 'GET') return answer(env, me, r, at);
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  // An import from the Road Trip app is a few hundred ops in one batch.
  const b = await body(req, 400000);
  const ops = b && Array.isArray(b.ops) && b.ops.length <= T.MAX.ops ? b.ops.map(T.check) : null;
  if (!ops || ops.some(op => !op)) return json({ error: 'body' }, 400);
  if (!ops.length) return answer(env, me, r, at);
  const home = { members: at.shared ? at.home.members : [p], ...T.apply(at.home, ops) };
  try { await env.LIB.put(HOME + at.id, JSON.stringify(home)); } catch (e) { return refused(e); }
  return answer(env, me, r, { ...at, home });
}
