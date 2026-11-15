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

  // The fields are read-only and typed on the shared keypad (shared/keypad.js); the parser still reads what it builds.
  // set() puts values in straight, for the layout checks.
  const set = (p, o) => p.evaluate(o => { KEYS.forEach(x => { const e = document.getElementById(x); e.value = o[x] || ''; e.parentElement.classList.remove('solved'); }); which = 0; update(); }, o);
  const keys = async (...ks) => { for (const k of ks) await page.tap(`#kp [data-key="${k}"]`); };
  const vals = () => page.evaluate(() => KEYS.map(x => document.getElementById(x).value));
  const name = () => page.$eval('#kpName', e => e.firstChild.textContent);
  const live = sel => page.$$eval(sel, l => l.map(b => !b.disabled && getComputedStyle(b).opacity === '1' && getComputedStyle(b.closest('.kp-frac') || b).opacity === '1'));
  // what is live: [fraction keys, slot 1 key, its key name, arrows]
  const state = async () => [(await live('#kp .kp-sub button')).every(Boolean) ? 'frac' : 'nofrac', (await live('#kp [data-slot]'))[0] ? 'slot' : 'slotoff',
    await page.getAttribute('#kp [data-slot]', 'data-key'), (await live('#kp .kp-bar .nav')).every(Boolean) ? 'nav' : 'nonav'].join(' ');
  check('the fields are read-only, open no phone keyboard and have no placeholder', await page.$$eval('main input', l => l.length === 6 && l.every(i => i.readOnly && i.inputMode === 'none' && !i.placeholder && !i.hasAttribute('enterkeyhint'))));
  check('no keypad until a field is tapped', !(await page.$('#kp')));

  // 3, 4, 5: a right triangle, typed with the arrows
  await page.tap('#clear');
  check('Clear opens the keypad on a', await page.isVisible('#kp') && await name() === 'Side a' && await page.$eval('#a', i => i.parentElement.classList.contains('on') && document.activeElement !== i));
  check('a side: fractions, the feet key, arrows', await state() === 'frac slot feet nav', await state());
  check('the result line says what is missing', (await page.textContent('#kpName .live')) === 'Need 3 more values', await page.textContent('#kpName'));
  await keys('3', 'next', '4', 'next');
  check('next walks a, b, c; the result line says Need 1 more value', await name() === 'Side c' && (await page.textContent('#kpName .live')) === 'Need 1 more value', [await name(), await page.textContent('#kpName')]);
  await keys('5');
  let got = await vals();
  check('3, 4, 5 solves to a right angle', got[5] === '90' && Math.abs(+got[3] + +got[4] - 90) < 1e-3, got);
  check('the result line shows the solve', (await page.textContent('#kpName .live')) === 'Scalene, right', await page.textContent('#kpName'));
  await keys('next');
  check('next goes on to A', await name() === 'Angle A');
  check('an angle: no fractions, the feet key dimmed, arrows', await state() === 'nofrac slotoff feet nav', await state());
  const ans = (await vals()).slice(3);
  await keys('next', 'next');
  check('next walks A, B, C, and the answers it passes stay', await name() === 'Angle C' && JSON.stringify((await vals()).slice(3)) === JSON.stringify(ans) && await page.$eval('#A', i => i.parentElement.classList.contains('solved')), await vals());
  check('the keypad shows the answer in the field', (await page.textContent('#kpVal')).startsWith('90'), await page.textContent('#kpVal'));
  await keys('prev', 'prev', 'prev', 'prev', 'prev');
  check('previous walks back C, B, A, c, b, a', await name() === 'Side a');
  await keys('prev');
  check('previous on a stays on a', await name() === 'Side a' && await page.isVisible('#kp'));
  await page.tap('#C');
  await keys('6', '0');
  got = await vals();
  check('typing over an answer makes it a value (C = 60 with a 3 4 5 is too many)', got[5] === '60' && !(await page.$eval('#C', i => i.parentElement.classList.contains('solved'))) && (await page.textContent('#note')).includes('exactly three'), got);
  await keys('done');
  check('Done closes the keypad, nokb off', !(await page.isVisible('#kp')) && await page.evaluate(() => !document.documentElement.classList.contains('nokb') && !document.querySelector('.fld.on')));

  // the same in fractions: 2 1/4, 3, 3 3/4
  await page.tap('#clear');
  await keys('2', 'n1', 'd4', 'next', '3', 'next', '3', 'n3', 'd4');
  check('2 1/4, 3, 3 3/4 typed as fractions is the same shape', (await page.inputValue('#a')) === '2 1/4' && (await page.inputValue('#c')) === '3 3/4' && (await page.inputValue('#C')) === '90', await vals());
  // feet-inches: 5' 3", 5' 3", 3' (feet only) are read as inches
  await page.tap('#clear');
  await keys('5', 'feet', '3', 'n1', 'd2', 'next', '6', '3', 'n1', 'd2', 'next', '3', 'feet', 'next');
  got = await vals();
  check('5, feet, 3 1/2 types 5\' 3 1/2" (63.5 in)', got[0] === '5\' 3 1/2"' && await page.evaluate(() => parseFrac(document.getElementById('a').value)) === 63.5, got);
  check('3, feet types 3\' (36 in), and it solves', got[2] === '3\'' && got[3] !== '' && !(await page.$eval('#note', n => n.classList.contains('err'))), got);
  check('next leaves the sides: A has no feet key', await name() === 'Angle A' && await state() === 'nofrac slotoff feet nav');
  // dimmed keys and their hardware keyboard keys do nothing on an angle
  await keys('clear', '4');
  await page.$$eval('#kp [data-key="n1"], #kp [data-key="d2"], #kp [data-key="feet"]', l => l.forEach(b => b.click()));
  await page.keyboard.type("/'");
  check('an angle ignores the fraction and feet keys', (await page.inputValue('#A')) === '4', await page.inputValue('#A'));
  // a hardware keyboard: Tab is next, Shift+Tab is previous, Escape is Done
  await page.keyboard.press('Tab');
  check('Tab goes to the next field', await name() === 'Angle B');
  await page.keyboard.press('Shift+Tab');
  check('Shift+Tab goes back', await name() === 'Angle A');
  await page.keyboard.press('Escape');
  check('Escape is Done', !(await page.isVisible('#kp')));
  await page.tap('#clear'); await keys('done');
  await set(page, { a: '3/0' });
  check('3/0 is marked as bad', await page.evaluate(() => document.getElementById('a').parentElement.classList.contains('bad')));
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
  for (const [size, side] of [['closed', false], ['open', false], ['openSideways', true]]) {
    const { width: w, height: h } = duo[size];
    const { c, p } = await sized(w, h);
    await p.goto(base); await p.waitForSelector('#a');
    await set(p, { a: '3', b: '4', c: '5' });
    const d = await box(p, '.draw'), s = await box(p, '.sec.hue-orange'), t = await box(p, '.sec.hue-teal');
    check(`${w}×${h}: ${side ? 'drawing on the left, sides beside it' : 'drawing on top, sides below'}`, side ? s.x > d.x + d.w && Math.abs(s.y - d.y) < 4 : s.y >= d.y + d.h, { d, s });
    check(`${w}×${h}: the cards do not overlap`, t.y >= s.y + s.h, { s, t });
    check(`${w}×${h}: no sideways scrolling`, (await sideways(p)) <= 0);
    // The keypad: the field sits above it; closed every key is 44 px wide; open upright it spans the width with its keys
    // at most 480 px wide, centred; open sideways it sits under the right pane only, and the drawing stays uncovered.
    await p.tap('#b'); await p.waitForTimeout(450);
    const kp = await box(p, '#kp'), kin = await box(p, '#kp .kp-in'), f = await box(p, '#b');
    check(`${w}×${h}: the field being typed shows above the keypad`, f.y + f.h <= kp.y && f.y >= 0, { f, kp });
    if (size === 'closed') {
      const kw = await p.$$eval('#kp .kp-whole button, #kp .kp-sub button', l => Math.min(...l.map(b => b.getBoundingClientRect().width)));
      check('keypad keys are 44 px wide at 382', kw >= 43.9, kw);
    }
    if (size !== 'closed') check(`${w}×${h}: the keys are at most 480 px wide, centred`, kin.w <= 480 && Math.abs((kin.x - kp.x) - (kp.x + kp.w - kin.x - kin.w)) <= 1, { kin, kp });
    if (size === 'open') check(`${w}×${h}: the keypad spans the width`, kp.x === 0 && kp.w === w, kp);
    if (size === 'openSideways') {
      const d2 = await box(p, '.draw');
      check(`${w}×${h}: the keypad sits under the right pane only, the drawing stays uncovered`, kp.x >= d2.x + d2.w && kp.x + kp.w === w, { kp, d2 });
      await p.tap('#kp [data-key="6"]');
      check(`${w}×${h}: the drawing updates live as keys are tapped`, (await p.textContent('#svg')).includes('b = 6'));
    }
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
    // The keypad is the input method: with it open, a shrinking visible area does not set html.kb and the keypad does not
    // move; the field being typed stays above it. Done turns html.nokb off, and the phone keyboard rules apply again.
    await p.tap('#C'); await p.waitForTimeout(450);
    const kb0 = await box(p, '#kp'), f = await box(p, '#C');
    check(`${tag} keyboard: C shows above the keypad`, f.y + f.h <= kb0.y && f.y >= 0, { f, kb0 });
    await p.evaluate(kb => __kb(kb, 0), kh); await p.waitForTimeout(300);
    const kb1 = await box(p, '#kp');
    check(`${tag} keyboard: with the keypad open html.kb stays off and the keypad does not move`, await p.evaluate(() => !document.documentElement.classList.contains('kb') && document.documentElement.classList.contains('nokb')) && JSON.stringify(kb0) === JSON.stringify(kb1), { kb0, kb1 });
    await p.tap('#kp [data-key="done"]');
    await p.evaluate(kb => __kb(kb, 0), kh); await p.waitForTimeout(300);
    check(`${tag} keyboard: after Done, html.kb is set again`, await p.evaluate(() => document.documentElement.classList.contains('kb') && !document.documentElement.classList.contains('nokb')));
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

  {
    const c = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' }), p = await c.newPage();
    await p.goto(base); await p.waitForTimeout(300);
    const miss = await require('../../test/tap44.cjs')(p);
    check('shared controls (seg, tabs, chips, home link) have a 44px tap area', miss.length === 0, miss);
    await c.close();
  }

  check('no console errors', errors.length === 0, errors);
  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
