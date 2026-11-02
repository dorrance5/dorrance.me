/* The meal plans and grocery lists for dorrance.me/recipes. index.js sends /api/meals and /api/meals/* here.
   Everyone signed in has a plan of their own: the dinners of each day and a grocery list. Two people can share one
   plan: one asks, and the other says yes. No one else can read a plan, the admin included. Plans are private, so they
   live in KV and not in the public GitHub repository. recipes/meals.js has the data and the ops, and the page uses the
   same file.

   GET  /api/meals                             -> the answer, { people, days, list, share }
   POST /api/meals         { ops }             -> the answer, after the ops
   GET  /api/meals/people                      -> { people: [{ key, name }] }: everyone who can be asked
   POST /api/meals/share   { do: 'ask', key }  -> the answer: ask someone to share your plan
                           { do: 'cancel' }       take your ask back
                           { do: 'join' }         say yes to the ask you got; a plan you share now stops being yours
                           { do: 'decline' }      say no
                           { do: 'leave' }        stop sharing: the other person keeps the plan, and you get yours back
   All of them need a sign-in. In the answer, `people` are the names of who plans (one or two), and `share` is
   { with, invite, asked }: the person you share with, who asked you, and who you asked, each { key, name } or null.
   One person shares with at most one other.

   KV (the LIB binding) keeps:
     meals:plan:ID  { members: [{ key, id, name }], days, list }. Your own plan's ID is solo.KEY.ID; a shared one gets a
                    new random ID, and starts as a copy of the plan of the person who asked.
     meals:me:KEY   { id, plan, invite, asked }: your shared plan, who asked you, and who you asked. Only someone who
                    shares, asks or was asked has one.
   An account's id tells it apart from a removed account that had the same name; the admin's id is 'admin'.
   A GET only reads, and so does /people (a KV list). A POST of ops is one read and one write. Asking, saying yes and
   leaving are a few writes. KV takes one write a second to one key: a write that meets another answers 429
   { error: 'busy' }, and the page sends again. Over the day's free writes, it answers 503 { error: 'full' }. */
import M from '../recipes/meals.js';
import { json, who, users, adminName, keyOf, nice } from './auth.js';

const PLAN = 'meals:plan:', ME = 'meals:me:', USER = 'auth:user:';
const today = () => new Date().toISOString().slice(0, 10);
const randomId = () => 'p' + [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');

async function body(req) {
  const text = await req.text().catch(() => '');
  if (text.length > 64000) return null;
  try { const b = JSON.parse(text); return b && typeof b === 'object' ? b : null; } catch { return null; }
}
// A person is { key, id, name }.
const person = me => ({ key: me.key, id: me.admin ? 'admin' : me.id, name: me.name });
const same = (a, b) => !!a && !!b && a.key === b.key && a.id === b.id;
const shown = p => p ? { key: p.key, name: nice(p.name) } : null;

// The person with this key, if the account can sign in.
async function account(env, key) {
  if (key === keyOf(adminName(env))) return { key, id: 'admin', name: adminName(env) };
  const u = await env.LIB.get(USER + key, 'json');
  return u && u.status === 'approved' ? { key, id: u.id, name: nice(u.name) } : null;
}
const alive = async (env, p) => same(await account(env, p.key), p);

// Someone's record. A record left by a removed account with the same name is not theirs.
async function record(env, p) {
  const r = await env.LIB.get(ME + p.key, 'json');
  return r && r.id === p.id ? r : {};
}
const saveRecord = (env, p, r) => r.plan || r.invite || r.asked
  ? env.LIB.put(ME + p.key, JSON.stringify({ id: p.id, plan: r.plan || null, invite: r.invite || null, asked: r.asked || null }))
  : env.LIB.delete(ME + p.key);

// Where someone plans: { id, plan, shared }. A shared plan they are no longer in does not count.
async function where(env, p, r) {
  if (r.plan) {
    const plan = await env.LIB.get(PLAN + r.plan, { type: 'json', cacheTtl: 30 });
    if (plan && Array.isArray(plan.members) && plan.members.some(m => same(m, p))) return { id: r.plan, plan, shared: true };
  }
  const id = `solo.${p.key}.${p.id}`;
  return { id, plan: await env.LIB.get(PLAN + id, { type: 'json', cacheTtl: 30 }), shared: false };
}
// The other person in a shared plan, if that account can still sign in.
async function partnerIn(env, p, at) {
  const other = at.shared && at.plan.members.find(m => !same(m, p));
  return other && await alive(env, other) ? other : null;
}

async function answer(env, me, r, at) {
  const p = person(me), d = M.tidy(at.plan), partner = await partnerIn(env, p, at);
  const people = partner ? at.plan.members.map(m => same(m, p) ? me.name : nice(m.name)) : [me.name];
  return json({ people, days: d.days, list: d.list, share: { with: shown(partner), invite: shown(r.invite), asked: shown(r.asked) } });
}

// A KV write that fails: busy (another write to the key this second) or full (the day's free writes are used up).
const refused = e => /limit/i.test(String(e && e.message)) ? json({ error: 'full' }, 503) : json({ error: 'busy' }, 429);

// Someone leaves a shared plan; the other person keeps it. The last one to leave keeps it as their own plan, so it
// comes back when they stop sharing again.
async function leavePlan(env, p, at) {
  const members = at.plan.members.filter(m => !same(m, p));
  if (members.length) return env.LIB.put(PLAN + at.id, JSON.stringify({ ...at.plan, members }));
  await env.LIB.put(PLAN + `solo.${p.key}.${p.id}`, JSON.stringify({ ...at.plan, members: [p] }));
  await env.LIB.delete(PLAN + at.id);
}

async function share(req, env, me, p, r) {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const b = await body(req);
  const what = b && b.do;
  if (what === 'ask') {
    if (typeof b.key !== 'string' || !b.key || b.key.length > 40 || b.key === p.key) return json({ error: 'body' }, 400);
    const at = await where(env, p, r);
    if (await partnerIn(env, p, at)) return json({ error: 'sharing' }, 409);
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
    const there = await where(env, from, theirs);
    if (await partnerIn(env, from, there)) return json({ error: 'taken' }, 409);
    const at = await where(env, p, r);
    if (at.shared) await leavePlan(env, p, at);   // the plan this person shared stays with the other one
    const id = randomId(), plan = { members: [from, p], ...M.tidy(there.plan) };
    await env.LIB.put(PLAN + id, JSON.stringify(plan));
    if (there.shared) await env.LIB.delete(PLAN + there.id);   // the asker's old shared plan, with no one else in it
    await saveRecord(env, from, { ...theirs, plan: id, asked: null });
    const mine = { ...r, plan: id, invite: null };
    await saveRecord(env, p, mine);
    return answer(env, me, mine, { id, plan, shared: true });
  }
  if (what === 'leave') {
    const at = await where(env, p, r);
    if (!at.shared) return answer(env, me, r, at);
    await leavePlan(env, p, at);
    const mine = { ...r, plan: null };
    await saveRecord(env, p, mine);
    return answer(env, me, mine, await where(env, p, mine));
  }
  return json({ error: 'body' }, 400);
}
// An ask taken back: it goes from the other person's record too.
async function takeBack(env, them, p) {
  const theirs = await record(env, them);
  if (same(theirs.invite, p)) await saveRecord(env, them, { ...theirs, invite: null });
}

export async function meals(req, env, url) {
  const path = url.pathname.replace(/^\/api\/meals\/?/, '').replace(/\/$/, '');
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
  const b = await body(req);
  const ops = b && Array.isArray(b.ops) && b.ops.length <= M.MAX.ops ? b.ops.map(M.check) : null;
  if (!ops || ops.some(op => !op)) return json({ error: 'body' }, 400);
  if (!ops.length) return answer(env, me, r, at);
  const plan = { members: at.shared ? at.plan.members : [p], ...M.apply(at.plan, ops, me.name, today()) };
  try { await env.LIB.put(PLAN + at.id, JSON.stringify(plan)); } catch (e) { return refused(e); }
  return answer(env, me, r, { ...at, plan });
}
