// Drives Counter in WebKit at iPhone size: counting, older saved counters, sorting, the early theme, offline and an
// app update. Exits 1 on a failed check or console error.
//   NODE_PATH=/path/to/node_modules node counter/test/flows.cjs
const { webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
let swBump = null;   // when set, sw.js is served with this cache name, like a deploy would
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
  if (swBump && p === '/counter/sw.js') body = Buffer.from(body.toString().replace(/const CACHE = (['"])[^'"]+\1/, `const CACHE = '${swBump}'`));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !ok ? ' — ' + JSON.stringify(info) : ''}`); };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/counter/`;
  const browser = await webkit.launch();
  const errors = [];
  const watch = p => { p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', e => errors.push(e.message)); return p; };
  // Routes and the clock need no service worker; the offline checks at the end turn it on.
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = watch(await ctx.newPage());

  page.on('dialog', d => d.accept());   // Reset and Delete ask first
  // An older Counter saved a time for every tap
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('counter-v1', JSON.stringify({ sort: 'manual', counters: [
      { id: 'a', name: 'Boxes', color: '#0A57D0', events: [1, 2, 3] }, { id: 'b', name: 'Antennas', color: '#D02A2A', events: [] }] }));
  });
  await page.goto(base);
  await page.waitForSelector('#n-a');
  const n = id => page.textContent('#n-' + id);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('counter-v1')).counters);
  check('an older counter keeps its count', await n('a') === '3' && await n('b') === '0');
  await page.tap('[data-id="a"]');
  check('a tap adds one', await n('a') === '4');
  check('it saves the number, not tap times', JSON.stringify((await saved()).map(c => [c.id, c.n, 'events' in c])) === '[["a",4,false],["b",0,false]]', await saved());
  await page.tap('[data-id="a"] [data-action="toggle"]');
  await page.tap('[data-id="a"] [data-action="dec"]');
  check('−1 takes one off', await n('a') === '3');
  await page.tap('[data-id="b"] [data-action="toggle"]');
  await page.tap('[data-id="b"] [data-action="dec"]');
  check('−1 stops at 0', await n('b') === '0');
  await page.reload(); await page.waitForSelector('#n-a');
  check('counts are kept after a reload', await n('a') === '3');
  const order = () => page.$$eval('#list .card', cs => cs.map(c => c.dataset.id).join());
  await page.tap('#sortBtn'); await page.tap('[data-sort="name"]');
  check('sort by name', await order() === 'b,a');
  await page.tap('#sortBtn'); await page.tap('[data-sort="count"]');
  check('sort by highest count', await order() === 'a,b');
  await page.tap('[data-id="a"] [data-action="toggle"]');
  await page.tap('[data-id="a"] [data-action="reset"]');
  check('Reset sets it to 0', await n('a') === '0');
  await page.tap('#addBtn'); await page.fill('#fName', 'Mounts'); await page.tap('[data-act="save"]');
  const added = (await saved()).find(c => c.name === 'Mounts');
  check('a new counter starts at 0', !!added && added.n === 0 && await n(added.id) === '0', added);

  // A dark phone starts dark: the theme is set before base.js loads (held back here for 1.5 s)
  {
    const c = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark', serviceWorkers: 'block' });
    await c.route('**/shared/base.js', async r => { await new Promise(w => setTimeout(w, 1500)); r.continue(); });
    const p = await c.newPage();
    p.goto(base).catch(() => {});
    await p.waitForSelector('body'); await p.waitForTimeout(400);
    const early = await p.evaluate(() => [document.documentElement.dataset.mode || 'light', !!window.App]);
    check('a dark phone is dark before the scripts load', early[0] === 'dark' && !early[1], early);
    await c.close();
  }

  // Offline, and an update, with the service worker on
  {
    const c = await browser.newContext({ ...devices['iPhone 13'] }), p = watch(await c.newPage());
    await p.goto(base);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload(); await p.waitForSelector('#list');
    check('the service worker is in charge after a reload', (await p.evaluate(() => navigator.serviceWorker.controller?.scriptURL || '')).endsWith('/counter/sw.js'));
    await p.waitForTimeout(300);
    check('no update notice on the first install', !(await p.$('.toast.tap')));
    await c.setOffline(true);
    const off = await p.reload().then(r => r && r.status(), () => 0);
    check('opens with the network off', off === 200 && !!(await p.$('#list')));
    await c.setOffline(false);
    swBump = 'counter-v999';
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    const notice = await p.waitForSelector('.toast.tap.on', { timeout: 8000 }).then(() => p.textContent('.toast'), () => null);
    check('an update says "Updated · Tap to reload"', notice === 'Updated · Tap to reload', notice);
    if (notice) {
      await Promise.all([p.waitForEvent('load'), p.tap('.toast')]);
      const keys = await p.evaluate(() => caches.keys());
      check('tapping it reloads, on the new cache only', keys.includes('counter-v999') && !keys.some(k => k.startsWith('counter-') && k !== 'counter-v999'), keys);
    }
    swBump = null;
    await c.close();
  }

  check('no console errors', errors.length === 0, errors);
  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
