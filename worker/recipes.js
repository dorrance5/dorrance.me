/* Recipes saves for dorrance.me/recipes. index.js sends /api/recipes/* here.
   Anyone with an approved dorrance.me account (auth.js) can save. The GitHub token is the secret GITHUB_TOKEN: it stays
   here and never goes to a phone.

   GET  /api/recipes/file                               -> { content, sha }       (signed in)
   PUT  /api/recipes/file   { message, content, sha }   -> { content: { sha } }   (signed in)

   An error is { error: CODE } with a status; recipes/data.js has the words for each code. */
import { json, who } from './auth.js';

const GH = 'https://api.github.com/repos/dorrance5/dorrance.me/contents/recipes/recipes.json';

async function body(req) {
  try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; }
}
// GitHub's answer when it is not OK, as one of our errors.
function ghFail(res) {
  if (res.status === 409) return json({ error: 'changed' }, 409);
  if (res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) return json({ error: 'rate' }, 429);
  return json({ error: 'github', status: res.status }, 502);
}
// recipes.json as base64: valid JSON with a "recipes" list.
function validFile(b64) {
  try {
    const bin = atob(b64.replace(/\s+/g, ''));
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    return !!data && Array.isArray(data.recipes);
  } catch { return false; }
}

export async function recipes(req, env, url) {
  const path = url.pathname.replace(/^\/api\/recipes\/?/, '').replace(/\/$/, '');
  if (path !== 'file') return json({ error: 'not found' }, 404);
  const me = await who(req, env);
  if (!me) return json({ error: 'signin' }, 401);
  if (!env.GITHUB_TOKEN) return json({ error: 'setup' }, 503);
  const gh = (method, b) => fetch(method === 'GET' ? GH + '?ref=main' : GH, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + env.GITHUB_TOKEN, 'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dorrance-api', ...(b ? { 'Content-Type': 'application/json' } : {}) },
    body: b ? JSON.stringify(b) : undefined
  });
  if (req.method === 'GET') {
    const res = await gh('GET');
    if (!res.ok) return ghFail(res);
    const f = await res.json();
    return json({ content: f.content, sha: f.sha });
  }
  if (req.method !== 'PUT') return json({ error: 'method' }, 405);
  const { message, content, sha } = await body(req);
  if (typeof message !== 'string' || !/^Recipes: [^\r\n]{1,150}$/.test(message) || typeof sha !== 'string' || typeof content !== 'string') return json({ error: 'body' }, 400);
  if (content.length > 2e6 || !validFile(content)) return json({ error: 'file' }, 400);
  // The commit says who made the change: "Recipes: add Banana bread (Megan)".
  const res = await gh('PUT', { message: `${message} (${me.name})`, content, sha, branch: 'main' });
  if (!res.ok) return ghFail(res);
  const out = await res.json();
  return json({ content: { sha: out.content && out.content.sha } });
}
