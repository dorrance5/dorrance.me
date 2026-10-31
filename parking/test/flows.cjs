// Drives Parking in WebKit at iPhone size against a stand-in for the Google Sheet: logging, the queue on the phone,
// syncing in rounds of 40, a change the sheet refuses, the early theme, offline and an app update.
// Exits 1 on a failed check or console error.
//   NODE_PATH=/path/to/node_modules node parking/test/flows.cjs
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
  if (swBump && p === '/parking/sw.js') body = Buffer.from(body.toString().replace(/const CACHE = (['"])[^'"]+\1/, `const CACHE = '${swBump}'`));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !ok ? ' — ' + JSON.stringify(info) : ''}`); };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/parking/`;
  const browser = await webkit.launch();
  const errors = [];
  const watch = p => { p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', e => errors.push(e.message)); return p; };
  // Each phone below is a context with no service worker, so its route reaches the sheet; the offline checks turn it on.

  // The sheet: takes every op except plates in `refuse`, and answers with what it took
  const sheet = { calls: 0, plates: [], refuse: new Set(), down: false };
  async function sheetRoute(r) {
    if (sheet.down) return r.abort();
    sheet.calls++;
    const body = JSON.parse(r.request().postData()), ok = o => !sheet.refuse.has(o.plate);
    for (const o of body.ops.filter(ok)) if (o.type === 'add') sheet.plates.push(o.plate);
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, done: body.ops.filter(ok).map(o => o.opId), rows: [],
      errors: body.ops.filter(o => !ok(o)).map(o => ({ error: 'Refused ' + o.plate })) }) });
  }
  const op = (i, plate) => ({ type: 'add', id: 'id' + i, opId: 'op' + i, plate: plate || 'ABC' + i, date: '2026-10-30', time: '22:00' });
  async function phone(queue) {
    const c = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    await c.route('https://sheet.example/**', sheetRoute);
    await c.addInitScript(q => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('parking-cfg', JSON.stringify({ url: 'https://sheet.example/exec', key: 'k' }));
      if (q) localStorage.setItem('parking-queue', JSON.stringify(q));
    }, queue || null);
    const p = watch(await c.newPage());
    await p.goto(base);
    await p.waitForSelector('#plate');
    return { c, p };
  }
  const queued = p => p.evaluate(() => JSON.parse(localStorage.getItem('parking-queue') || '[]').map(o => o.plate));

  // Log a plate: it goes to the sheet
  let { c, p } = await phone();
  await p.fill('#plate', 'abc 123');
  await p.tap('#log');
  await p.waitForTimeout(1200);
  check('a logged plate goes to the sheet, tidied', sheet.plates.includes('ABC123'), sheet.plates);
  check('nothing is left on the phone', (await queued(p)).length === 0);
  // With no signal it stays on the phone, and goes once the sheet answers again
  sheet.down = true;
  await p.fill('#plate', 'XYZ9'); await p.tap('#log');
  await p.waitForTimeout(1200);
  check('with no signal the entry waits on the phone', (await queued(p)).join() === 'XYZ9');
  sheet.down = false;
  await p.evaluate(() => dispatchEvent(new Event('online')));
  await p.waitForTimeout(1200);
  check('it goes when the sheet can be reached', sheet.plates.includes('XYZ9') && (await queued(p)).length === 0);
  await c.close();

  // A change the sheet refuses is not sent over and over
  sheet.calls = 0; sheet.refuse.add('BADPLATE');
  ({ c, p } = await phone([op(1), op(2, 'BADPLATE'), op(3)]));
  await p.waitForTimeout(3000);
  check('a refused change is not resent at once (calls in 3 s)', sheet.calls <= 2, sheet.calls);
  check('the others go; the refused one waits on the phone', (await queued(p)).join() === 'BADPLATE');
  await c.close();
  sheet.refuse.clear();

  // 45 waiting entries go in rounds of 40
  sheet.calls = 0; sheet.plates = [];
  ({ c, p } = await phone(Array.from({ length: 45 }, (_, i) => op(i))));
  await p.waitForTimeout(2500);
  check('45 waiting entries all go, in two rounds', sheet.plates.length === 45 && sheet.calls === 2 && (await queued(p)).length === 0, { plates: sheet.plates.length, calls: sheet.calls });
  await c.close();

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
    await p.reload(); await p.waitForSelector('#plate');
    check('the service worker is in charge after a reload', (await p.evaluate(() => navigator.serviceWorker.controller?.scriptURL || '')).endsWith('/parking/sw.js'));
    await p.waitForTimeout(300);
    check('no update notice on the first install', !(await p.$('.toast.tap')));
    await c.setOffline(true);
    const off = await p.reload().then(r => r && r.status(), () => 0);
    check('opens with the network off', off === 200 && !!(await p.$('#plate')));
    await c.setOffline(false);
    swBump = 'parking-v999';
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    const notice = await p.waitForSelector('.toast.tap.on', { timeout: 8000 }).then(() => p.textContent('.toast'), () => null);
    check('an update says "Updated · Tap to reload"', notice === 'Updated · Tap to reload', notice);
    if (notice) {
      await Promise.all([p.waitForEvent('load'), p.tap('.toast')]);
      const keys = await p.evaluate(() => caches.keys());
      check('tapping it reloads, on the new cache only', keys.includes('parking-v999') && !keys.some(k => k.startsWith('parking-') && k !== 'parking-v999'), keys);
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
