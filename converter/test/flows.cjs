// Drives Converter in WebKit at iPhone size: fractions and feet-inches as typed, conversions, the early theme,
// offline and an app update. Exits 1 on a failed check or console error.
//   NODE_PATH=/path/to/node_modules node converter/test/flows.cjs
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
  if (swBump && p === '/converter/sw.js') body = Buffer.from(body.toString().replace(/const CACHE = (['"])[^'"]+\1/, `const CACHE = '${swBump}'`));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !ok ? ' — ' + JSON.stringify(info) : ''}`); };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/converter/`;
  const browser = await webkit.launch();
  const errors = [];
  const watch = p => { p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', e => errors.push(e.message)); return p; };
  // Routes and the clock need no service worker; the offline checks at the end turn it on.
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = watch(await ctx.newPage());

  await page.goto(base);
  await page.waitForSelector('#val');
  const reads = (s, want) => page.evaluate(s => parseFrac(s), s).then(v => check(`reads ${s} as ${want}`, v === want, v));
  // A whole number and a fraction need a space: 15/16 is fifteen sixteenths, not 1 5/16
  for (const [s, want] of [['15/16', .9375], ['11/16', .6875], ['13/32', .40625], ['3/4', .75], ['3 15/16', 3.9375], ['3 1/2', 3.5],
    ['-1 1/2', -1.5], ['.5', .5], ['2.5', 2.5], ['1,000', 1000]]) await reads(s, want);
  check('a zero denominator is not a number', await page.evaluate(() => isNaN(parseFrac('3/0')) && isNaN(parseFrac('1 3/0'))));
  for (const [s, want] of [["5' 11/16\"", 60.6875], ["5' 3 1/2\"", 63.5], ['5 ft 3.5 in', 63.5], ['5-3', 63], ['63', 63]])
    check(`feet-inches: ${s} is ${want} in`, await page.evaluate(s => parseFtIn(s), s) === want);

  const conv = async (from, to, val) => { await page.selectOption('#from', from); await page.selectOption('#to', to); await page.fill('#val', val); return page.textContent('#out'); };
  await page.tap('[data-cat="Length"]');
  check('15/16 in is 23.8125 mm', await conv('in', 'mm', '15/16') === '23.8125');
  check('1000 mm is 3\' 3 3/8"', await conv('mm', 'ft in', '1000') === '3\' 3 3/8"');
  check('3/0 says Numbers only', await conv('in', 'mm', '3/0') === '–' && (await page.textContent('#sub')) === 'Numbers only');
  await page.tap('[data-cat="Temperature"]');
  check('212 °F is 100 °C', await conv('°F', '°C', '212') === '100');
  await page.tap('[data-cat="Weight"]');
  check('1 lb is 0.453592 kg', await conv('lb', 'kg', '1') === '0.453592');

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

  // iPhone Duo sizes: closed upright and sideways, open upright and sideways (CSS px)
  const sized = async (w, h) => { const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }); return { c, p: watch(await c.newPage()) }; };
  const box = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
  const sideways = p => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  for (const [w, h, wide] of [[382, 580, false], [594, 368, true], [669, 867, true], [951, 585, true]]) {
    const { c, p } = await sized(w, h);
    await p.goto(base); await p.waitForSelector('#val');
    const card = await box(p, '#card'), out = await box(p, '#outCard'), table = await box(p, '#table');
    check(`${w}×${h}: ${wide ? 'every unit beside the amount and the answer' : 'one column'}`, wide ? table.x > card.x + card.w && out.y >= card.y + card.h && out.x === card.x : out.y >= card.y + card.h && table.y >= out.y + out.h, { card, out, table });
    check(`${w}×${h}: no sideways scrolling`, (await sideways(p)) <= 0);
    await c.close();
  }

  // Offline, and an update, with the service worker on
  {
    const c = await browser.newContext({ ...devices['iPhone 13'] }), p = watch(await c.newPage());
    await p.goto(base);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload(); await p.waitForSelector('#val');
    check('the service worker is in charge after a reload', (await p.evaluate(() => navigator.serviceWorker.controller?.scriptURL || '')).endsWith('/converter/sw.js'));
    await p.waitForTimeout(300);
    check('no update notice on the first install', !(await p.$('.toast.tap')));
    await c.setOffline(true);
    const off = await p.reload().then(r => r && r.status(), () => 0);
    check('opens with the network off', off === 200 && !!(await p.$('#val')));
    await c.setOffline(false);
    swBump = 'converter-v999';
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    const notice = await p.waitForSelector('.toast.tap.on', { timeout: 8000 }).then(() => p.textContent('.toast'), () => null);
    check('an update says "Updated · Tap to reload"', notice === 'Updated · Tap to reload', notice);
    if (notice) {
      await Promise.all([p.waitForEvent('load'), p.tap('.toast')]);
      const keys = await p.evaluate(() => caches.keys());
      check('tapping it reloads, on the new cache only', keys.includes('converter-v999') && !keys.some(k => k.startsWith('converter-') && k !== 'converter-v999'), keys);
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
