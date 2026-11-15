// Drives Converter in WebKit at iPhone size: fractions and feet-inches as typed, conversions, the early theme,
// offline and an app update. Exits 1 on a failed check or console error.
//   NODE_PATH=/path/to/node_modules node converter/test/flows.cjs
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
    ['-1 1/2', -1.5], ['.5', .5], ['2.5', 2.5], ['1,000', 1000], ['1,5', 1.5], ['0,25', .25], ['-2,5', -2.5], ['1,234.5', 1234.5], ['12,345,678', 12345678]]) await reads(s, want);
  check('a zero denominator is not a number', await page.evaluate(() => isNaN(parseFrac('3/0')) && isNaN(parseFrac('1 3/0'))));
  for (const [s, want] of [["5' 11/16\"", 60.6875], ["5' 3 1/2\"", 63.5], ['5 ft 3.5 in', 63.5], ['5-3', 63], ['63', 63]])
    check(`feet-inches: ${s} is ${want} in`, await page.evaluate(s => parseFtIn(s), s) === want);

  // The amount is read-only and typed on the shared keypad (shared/keypad.js); the parsers still read what it builds.
  // conv() puts text in straight, for the parser checks.
  const conv = async (from, to, val) => { await page.selectOption('#from', from); await page.selectOption('#to', to); await page.evaluate(v => { document.getElementById('val').value = v; convert(); }, val); return page.textContent('#out'); };
  await page.tap('[data-cat="Length"]');
  check('15/16 in is 23.8125 mm', await conv('in', 'mm', '15/16') === '23.8125');
  check('1000 mm is 3\' 3 3/8"', await conv('mm', 'ft in', '1000') === '3\' 3 3/8"');
  check('3/0 says Numbers only', await conv('in', 'mm', '3/0') === '–' && (await page.textContent('#sub')) === 'Numbers only');
  check('1,5 mm shows 1.5 (a decimal comma), not 15', await conv('mm', 'cm', '1,5') === '0.15');

  const keys = async (...ks) => { for (const k of ks) await page.tap(`#kp [data-key="${k}"]`); };
  const val = () => page.inputValue('#val');
  const live = sel => page.$$eval(sel, l => l.map(b => !b.disabled && getComputedStyle(b).opacity !== '0' && getComputedStyle(b.closest('.kp-frac') || b).opacity === '1'));
  // what is live: [fraction keys, slot 1 key, its key name, arrows]
  const state = async () => [(await live('#kp .kp-sub button')).every(Boolean) ? 'frac' : (await live('#kp .kp-sub button')).some(Boolean) ? 'mixed' : 'nofrac',
    (await live('#kp [data-slot]'))[0] ? 'slot' : 'slotoff', await page.getAttribute('#kp [data-slot]', 'data-key'), (await live('#kp .kp-bar .nav')).some(Boolean) ? 'nav' : 'nonav'].join(' ');
  check('the amount is read-only, opens no phone keyboard and has no placeholder', await page.$eval('#val', i => i.readOnly && i.inputMode === 'none' && !i.placeholder && !i.hasAttribute('enterkeyhint')));
  check('no keypad until the amount is tapped', !(await page.$('#kp')));
  await conv('in', 'mm', '1');
  check('no fraction hint', !(await page.textContent('#hint')).includes('Fractions'));
  await page.tap('#val');
  check('tapping the amount opens the keypad, not the phone keyboard', await page.isVisible('#kp') && await page.evaluate(() => document.documentElement.classList.contains('nokb') && document.activeElement !== document.getElementById('val')));
  check('the amount field shows it is being typed', await page.$eval('#val', i => i.parentElement.classList.contains('on')));
  check('the keypad covers the category bar', await page.evaluate(() => document.getElementById('kp').getBoundingClientRect().top < document.getElementById('cats').getBoundingClientRect().top));
  check('in: fractions, the feet key, no arrows', await state() === 'frac slot feet nonav', await state());
  check('the feet key is called "Feet"', await page.getAttribute('#kp [data-slot]', 'aria-label') === 'Feet');
  await keys('3', 'n1', 'd2');
  check('3, numerator 1, denominator 2 types 3 1/2 = 88.9 mm', await val() === '3 1/2' && await page.textContent('#out') === '88.9', [await val(), await page.textContent('#out')]);
  check('the result line in the keypad says = 88.9 mm', (await page.textContent('#kpName .live')) === '= 88.9 mm', await page.textContent('#kpName'));
  await keys('clear', '5', 'feet', '3', 'n1', 'd4');
  check('5, feet, 3, 1/4 types 5\' 3 1/4" = 1,606.55 mm', await val() === '5\' 3 1/4"' && await page.textContent('#out') === '1,606.55', [await val(), await page.textContent('#out')]);
  check('the keypad shows the feet and the inch mark', (await page.textContent('#kpVal')).replace(/\s+/g, ' ') === '5\' 314"', await page.textContent('#kpVal'));
  await keys('back');
  check('delete: the denominator first (half typed, the amount waits)', await val() === '5\' 3 1/4"' && (await page.textContent('#kpVal')).includes('·'));
  await keys('back');
  check('delete: then the numerator', await val() === '5\' 3"', await val());
  await keys('back');
  check('delete: then the inches', await val() === '5\'', await val());
  await keys('back');
  check('delete: then the feet mark (5 inches again)', await val() === '5' && await page.textContent('#out') === '127', [await val(), await page.textContent('#out')]);
  await keys('clear', '3', 'n3', 'd2');
  check('3 3/2 is held back while typing (the amount stays 3)', await val() === '3', await val());
  await keys('done');
  check('Done closes the keypad and saves 3 3/2 (4.5 in)', !(await page.isVisible('#kp')) && await val() === '3 3/2' && await page.textContent('#out') === '114.3', [await val(), await page.textContent('#out')]);
  check('Done brings back the category bar and the phone keyboard rules (nokb off)', await page.evaluate(() => !document.documentElement.classList.contains('nokb') && !document.getElementById('val').parentElement.classList.contains('on') && document.elementFromPoint(innerWidth / 2, document.getElementById('cats').getBoundingClientRect().top + 20)?.closest('#cats')));
  await page.tap('#val');
  check('the first key replaces the amount', await (async () => { await keys('7'); return await val() === '7'; })());
  await page.selectOption('#from', 'ft');
  check('ft: the feet key still', await state() === 'frac slot feet nonav', await state());
  await keys('6', 'feet', '9');
  check('ft: 6, feet, 9 is 6.75 ft = 2,057.4 mm', await val() === '6\' 9"' && await page.textContent('#out') === '2,057.4', [await val(), await page.textContent('#out')]);
  await page.selectOption('#from', 'ft in');
  check('ft in: the feet key still', await state() === 'frac slot feet nonav', await state());
  await page.selectOption('#from', 'mm');
  check('mm: fractions, no feet key (± dimmed), no arrows', await state() === 'frac slotoff sign nonav', await state());
  await keys('2', '5', '.', '4');
  check('mm: 25.4 is 1 in', await val() === '25.4' && (await conv('mm', 'in', '25.4')) === '1');
  // a hardware keyboard: digits, / and Return
  await page.keyboard.type('15/16');
  check('a hardware keyboard types 15/16', await val() === '15/16', await val());
  await page.keyboard.press('Enter');
  check('Return is Done (one field)', !(await page.isVisible('#kp')));
  await page.tap('[data-cat="Weight"]'); await page.tap('#val');
  check('weight: no fractions, ± and arrows dimmed', await state() === 'nofrac slotoff sign nonav', await state());
  await keys('2');
  await page.$$eval('#kp [data-key="n1"], #kp [data-key="d2"], #kp [data-key="sign"]', l => l.forEach(b => b.click()));
  await page.keyboard.type('/-');
  check('weight: dimmed keys and their keyboard keys do nothing', await val() === '2', await val());
  await keys('done');
  await page.tap('[data-cat="Temperature"]'); await page.tap('#val');
  check('temperature: no fractions, ± works, no arrows', await state() === 'nofrac slot sign nonav', await state());
  await page.selectOption('#from', '°F'); await page.selectOption('#to', '°C');
  await keys('4', '0', 'sign');
  check('temperature: 4, 0, ± is -40 °F = -40 °C', await val() === '-40' && await page.textContent('#out') === '-40', [await val(), await page.textContent('#out')]);
  await keys('done');
  check('light and dark theme-color metas', await page.$$eval('meta[name=theme-color][media]', m => m.length) === 2);
  // The category bar keeps its scroll when a category is tapped (a phone width where the seven do not all fit)
  {
    const c = await browser.newContext({ viewport: { width: 382, height: 700 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }), p = watch(await c.newPage());
    await p.goto(base); await p.waitForSelector('#val');
    const before = await p.evaluate(() => { const b = document.getElementById('cats'); b.firstElementChild.__mark = 1; b.scrollLeft = b.scrollWidth; return { sl: b.scrollLeft, over: b.scrollWidth > b.clientWidth }; });
    await p.tap('[data-cat="Data"]');
    const after = await p.evaluate(() => { const b = document.getElementById('cats'); return { sl: b.scrollLeft, same: b.firstElementChild.__mark === 1, on: b.querySelector('.on')?.dataset.cat }; });
    check('the category bar scrolls at 382', before.over && before.sl > 0, before);
    check('tapping a category keeps the bar scrolled and its buttons', after.sl === before.sl && after.same && after.on === 'Data', { before, after });
    await c.close();
  }
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
  for (const [size, wide] of [['closed', false], ['open', true], ['openSideways', true]]) {
    const { width: w, height: h } = duo[size];
    const { c, p } = await sized(w, h);
    await p.goto(base); await p.waitForSelector('#val');
    const card = await box(p, '#card'), out = await box(p, '#outCard'), table = await box(p, '#table');
    check(`${w}×${h}: ${wide ? 'every unit beside the amount and the answer' : 'one column'}`, wide ? table.x > card.x + card.w && out.y >= card.y + card.h && out.x === card.x : out.y >= card.y + card.h && table.y >= out.y + out.h, { card, out, table });
    check(`${w}×${h}: no sideways scrolling`, (await sideways(p)) <= 0);
    const cats = await box(p, '#cats'), main = await box(p, 'main');
    check(`${w}×${h}: the categories are a bar at the bottom`, cats.y >= main.y + main.h - 1 && Math.abs(cats.y + cats.h - h) <= 1, { cats, main });
    // The keypad: the amount sits above it; closed every key is 44 px wide; open upright it spans the width with its keys
    // at most 480 px wide, centred; open sideways it sits under the left pane only, and the units on the right update live.
    await p.tap('#val'); await p.waitForTimeout(450);
    const kp = await box(p, '#kp'), kin = await box(p, '#kp .kp-in'), f = await box(p, '#val');
    check(`${w}×${h}: the amount shows above the keypad`, f.y + f.h <= kp.y && f.y >= 0, { f, kp });
    if (size === 'closed') {
      const kw = await p.$$eval('#kp .kp-whole button, #kp .kp-sub button', l => Math.min(...l.map(b => b.getBoundingClientRect().width)));
      check('keypad keys are 44 px wide at 382', kw >= 43.9, kw);
    }
    if (size !== 'closed') check(`${w}×${h}: the keys are at most 480 px wide, centred`, kin.w <= 480 && Math.abs((kin.x - kp.x) - (kp.x + kp.w - kin.x - kin.w)) <= 1, { kin, kp });
    if (size === 'open' || size === 'closedSideways') check(`${w}×${h}: the keypad spans the width`, kp.x === 0 && kp.w === w, kp);
    if (size === 'openSideways') {
      const t = await box(p, '#table');
      check(`${w}×${h}: the keypad sits under the left pane only, the units stay uncovered`, kp.x === 0 && kp.x + kp.w <= t.x && kp.w >= card.w, { kp, t, card });
      const before = await p.textContent('#table');
      await p.tap('#kp [data-key="2"]');
      check(`${w}×${h}: the units update live as keys are tapped`, (await p.textContent('#table')) !== before && await p.isVisible('#table'));
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
    await p.goto(base); await p.waitForSelector('#val');
    // The keypad is the amount's input method: with it open, a shrinking visible area (a picker, say) does not set html.kb
    // and the keypad does not move. Done turns html.nokb off, and the phone keyboard rules (html.kb) apply again.
    await p.tap('#val'); await p.waitForTimeout(300);
    const kb0 = await box(p, '#kp');
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

  {
    const src = fs.readFileSync(path.join(root, 'converter', 'sw.js'), 'utf8');
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
