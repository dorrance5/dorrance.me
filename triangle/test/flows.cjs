// Drives Triangle in WebKit at iPhone size: fractions and feet-inches as typed, a solve, the early theme, offline
// and an app update. Exits 1 on a failed check or console error.
//   NODE_PATH=/path/to/node_modules node triangle/test/flows.cjs
const { webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { duo, keyboard } = require('../../test/devices.cjs');

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

  // Return: next field, skipping answers, and the keyboard goes away after the last
  await page.tap('#clear');
  check('Return hints: next on five fields, done on C', await page.$$eval('main input', l => l.map(i => i.getAttribute('enterkeyhint')).join()) === 'next,next,next,next,next,done', await page.$$eval('main input', l => l.map(i => i.id + ':' + i.enterkeyhint).join()));
  await page.focus('#a'); await page.keyboard.press('Enter');
  check('Return in a goes to b', await page.evaluate(() => document.activeElement.id) === 'b');
  await page.fill('#a', '3'); await page.fill('#b', '4'); await page.fill('#c', '5');   // A and B are answers now
  await page.focus('#c'); await page.keyboard.press('Enter');
  check('Return after c skips the answers A and B (they stay)', await page.evaluate(() => ['A', 'B'].every(x => document.getElementById(x).value !== '') && document.activeElement.id !== 'A' && document.activeElement.id !== 'B'));
  await page.focus('#C'); await page.keyboard.press('Enter');
  check('Return in the last field puts the keyboard away', await page.evaluate(() => !document.activeElement || document.activeElement === document.body));
  check('light and dark theme-color metas', await page.$$eval('meta[name=theme-color][media]', m => m.length) === 2);

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
  for (const [size, side] of [['closed', false], ['closedSideways', true], ['open', false], ['openSideways', true]]) {
    const { width: w, height: h } = duo[size];
    const { c, p } = await sized(w, h);
    await p.goto(base); await p.waitForSelector('#a');
    await p.fill('#a', '3'); await p.fill('#b', '4'); await p.fill('#c', '5');
    const d = await box(p, '.draw'), s = await box(p, '.sec.hue-orange'), t = await box(p, '.sec.hue-teal');
    check(`${w}×${h}: ${side ? 'drawing on the left, sides beside it' : 'drawing on top, sides below'}`, side ? s.x > d.x + d.w && Math.abs(s.y - d.y) < 4 : s.y >= d.y + d.h, { d, s });
    check(`${w}×${h}: the cards do not overlap`, t.y >= s.y + s.h, { s, t });
    check(`${w}×${h}: no sideways scrolling`, (await sideways(p)) <= 0);
    await c.close();
  }


  // The phone keyboard, on the Duo's measured Safari keyboard poses (test/devices.cjs): a stand-in visualViewport that the test shrinks, the way iOS does
  // (the layout viewport stays full height).
  for (const [pose, kbd] of Object.entries(keyboard)) {
    const w = kbd.width, h = kbd.pageHeight;
    const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await c.addInitScript(() => {
      const t = new EventTarget(), vv = { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1, addEventListener: (a, b) => t.addEventListener(a, b), removeEventListener() {} };
      Object.defineProperty(window, 'visualViewport', { value: vv });
      window.__kb = (kh, off) => { vv.height = innerHeight - kh; vv.offsetTop = off || 0; t.dispatchEvent(new Event('resize')); };
    });
    const p = watch(await c.newPage()), kh = h - kbd.visibleHeight, tag = `${pose} ${w}×${h}`;
    await p.goto(base); await p.waitForSelector('#C');
    await p.focus('#C');
    // a field on the page itself: iOS pans the page to put it in view, so the stand-in is not panned for this check
    await p.evaluate(kb => __kb(kb, 0), kh); await p.waitForTimeout(600);
    const k = await p.evaluate(([sel, kh]) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { kb: document.documentElement.classList.contains('kb'), top: r.top, bottom: r.bottom, lo: visualViewport.offsetTop, vis: visualViewport.offsetTop + visualViewport.height };
    }, ['#C', kh]);
    check(`${tag} keyboard: html.kb is set`, k.kb, k);
    check(`${tag} keyboard: the focused field is visible`, k.top >= k.lo - 1 && k.bottom <= k.vis + 1, k);
    await p.evaluate(([kb, o]) => __kb(kb, o), [kh, kbd.offsetTop]); await p.waitForTimeout(200);   // now panned as measured
    await p.evaluate(() => document.getElementById('setBtn').click()); await p.waitForSelector('.sheet'); await p.waitForTimeout(300);
    const s = await p.evaluate(kh => { const r = document.querySelector('.sheet').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, lo: visualViewport.offsetTop, vis: visualViewport.offsetTop + visualViewport.height }; }, kh);
    check(`${tag} keyboard: an open sheet fits the visible area`, s.top >= s.lo - 1 && s.bottom <= s.vis + 1, s);
    await p.tap('.backdrop', { position: { x: 5, y: 5 } }); await p.waitForTimeout(150);
    check(`${tag} keyboard: a backdrop tap with no field in the sheet closes it`, await p.evaluate(() => !document.querySelector('.backdrop')));
    await p.evaluate(() => __kb(0, 0)); await p.waitForTimeout(200);
    check(`${tag} keyboard: html.kb goes away with the keyboard`, await p.evaluate(() => !document.documentElement.classList.contains('kb')));
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

  {
    const src = fs.readFileSync(path.join(root, 'triangle', 'sw.js'), 'utf8');
    check('sw.js: the cache write is awaited and held open with waitUntil', /await cache\.put/.test(src) && /e\.waitUntil\(net/.test(src), src.slice(-600));
    check('sw.js: refreshes the page, JS and CSS only, with no-cache', /no-cache/.test(src) && /navigate/.test(src) && /\(js\|css\)/.test(src));
  }

  check('no console errors', errors.length === 0, errors);
  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
