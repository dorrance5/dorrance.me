// Drives Triangle in WebKit at iPhone size: fractions and feet-inches as typed, a solve, the early theme, offline
// and an app update. Exits 1 on a failed check or console error.
//   NODE_PATH=/path/to/node_modules node triangle/test/flows.cjs
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
  if (swBump && p === '/triangle/sw.js') body = Buffer.from(body.toString().replace(/const CACHE = (['"])[^'"]+\1/, `const CACHE = '${swBump}'`));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !ok ? ' — ' + JSON.stringify(info) : ''}`); };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/triangle/`;
  const browser = await webkit.launch();
  const errors = [];
  const watch = p => { p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', e => errors.push(e.message)); return p; };
  // Routes and the clock need no service worker; the offline checks at the end turn it on.
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = watch(await ctx.newPage());

  await page.goto(base);
  await page.waitForSelector('#a');
  // A whole number and a fraction need a space: 15/16 is fifteen sixteenths, not 1 5/16
  for (const [s, want] of [['15/16', .9375], ['11/16', .6875], ['3/4', .75], ['3 15/16', 3.9375], ['3 1/2', 3.5], ['12', 12], ['2.5', 2.5],
    ["5' 11/16\"", 60.6875], ["5' 3 1/2\"", 63.5], ['4 ft', 48]])
    check(`reads ${s} as ${want}`, await page.evaluate(s => parseFrac(s), s) === want);
  check('a zero denominator is not a number', await page.evaluate(() => isNaN(parseFrac('3/0'))));

  // 3, 4, 5: a right triangle
  await page.tap('#clear');
  await page.fill('#a', '3'); await page.fill('#b', '4'); await page.fill('#c', '5');
  const got = await page.evaluate(() => ['A', 'B', 'C'].map(x => document.getElementById(x).value));
  check('3, 4, 5 solves to a right angle', got[2] === '90' && Math.abs(+got[0] + +got[1] - 90) < 1e-3, got);
  // the same in sixteenths: 2 1/4, 3, 3 3/4
  await page.tap('#clear');
  await page.fill('#a', '2 1/4'); await page.fill('#b', '3'); await page.fill('#c', '3 3/4');
  check('2 1/4, 3, 3 3/4 is the same shape', (await page.inputValue('#C')) === '90');
  await page.tap('#clear');
  await page.fill('#a', '3/0');
  check('3/0 is marked as bad', await page.evaluate(() => document.getElementById('a').parentElement.classList.contains('bad')));

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
    await p.reload(); await p.waitForSelector('#a');
    check('the service worker is in charge after a reload', (await p.evaluate(() => navigator.serviceWorker.controller?.scriptURL || '')).endsWith('/triangle/sw.js'));
    await p.waitForTimeout(300);
    check('no update notice on the first install', !(await p.$('.toast.tap')));
    await c.setOffline(true);
    const off = await p.reload().then(r => r && r.status(), () => 0);
    check('opens with the network off', off === 200 && !!(await p.$('#a')));
    await c.setOffline(false);
    swBump = 'triangle-v999';
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    const notice = await p.waitForSelector('.toast.tap.on', { timeout: 8000 }).then(() => p.textContent('.toast'), () => null);
    check('an update says "Updated · Tap to reload"', notice === 'Updated · Tap to reload', notice);
    if (notice) {
      await Promise.all([p.waitForEvent('load'), p.tap('.toast')]);
      const keys = await p.evaluate(() => caches.keys());
      check('tapping it reloads, on the new cache only', keys.includes('triangle-v999') && !keys.some(k => k.startsWith('triangle-') && k !== 'triangle-v999'), keys);
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
