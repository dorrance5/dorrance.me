/* dorrance.me API. A Cloudflare Worker on the route dorrance.me/api/*.
   TV Mount shared library: one JSON value in KV under "tvmount.lib".
   GET    /api/tvmount/lib              -> { tvs: [], mounts: [] }   (anyone)
   PUT    /api/tvmount/lib/tv|mount     body: item, saved by model     (passcode)
   DELETE /api/tvmount/lib/tv|mount/ID                                  (passcode)
   Writes need the header X-Passcode equal to the PASSCODE secret.
   dorrance.me accounts: /api/auth/*, in auth.js. Recipes saves: /api/recipes/*, in recipes.js. The Recipes meal plan
   and grocery list: /api/meals, in meals.js. Road Trip's cars: /api/roadtrip, in roadtrip.js. */
import { auth } from './auth.js';
import { recipes } from './recipes.js';
import { meals } from './meals.js';
import { roadtrip } from './roadtrip.js';

const KEY = 'tvmount.lib';
const LIST = { tv: 'tvs', mount: 'mounts' };
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const norm = s => String(s || '').trim().toLowerCase();

async function read(env) {
  const lib = await env.LIB.get(KEY, 'json');
  return lib && Array.isArray(lib.tvs) && Array.isArray(lib.mounts) ? lib : { tvs: [], mounts: [] };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/auth/')) return auth(req, env, url);
    if (url.pathname.startsWith('/api/recipes/')) return recipes(req, env, url);
    if (/^\/api\/meals(\/|$)/.test(url.pathname)) return meals(req, env, url);
    if (/^\/api\/roadtrip(\/|$)/.test(url.pathname)) return roadtrip(req, env, url);
    const m = url.pathname.match(/^\/api\/tvmount\/lib(?:\/(tv|mount)(?:\/([\w-]+))?)?\/?$/);
    if (!m) return json({ error: 'not found' }, 404);
    const [, kind, id] = m;

    if (req.method === 'GET' && !kind) return json(await read(env));

    if (!env.PASSCODE || req.headers.get('x-passcode') !== env.PASSCODE) return json({ error: 'passcode' }, 403);
    if (!kind) return json({ error: 'kind' }, 400);
    const lib = await read(env), list = lib[LIST[kind]];

    if (req.method === 'PUT' && !id) {
      let item;
      try { item = await req.json(); } catch { return json({ error: 'body' }, 400); }
      if (!item || typeof item !== 'object' || !norm(item.model) || JSON.stringify(item).length > 4000) return json({ error: 'item' }, 400);
      const i = list.findIndex(x => norm(x.model) === norm(item.model));
      const out = Object.assign({}, item, { id: i >= 0 ? list[i].id : String(item.id || 'l' + Date.now().toString(36)) });
      if (i >= 0) list[i] = out; else list.push(out);
      await env.LIB.put(KEY, JSON.stringify(lib));
      return json({ item: out, lib });
    }
    if (req.method === 'DELETE' && id) {
      const i = list.findIndex(x => x.id === id);
      if (i >= 0) { list.splice(i, 1); await env.LIB.put(KEY, JSON.stringify(lib)); }
      return json({ lib });
    }
    return json({ error: 'method' }, 405);
  }
};
