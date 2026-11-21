// Drives the home page (the DM-1 gadget) in WebKit at iPhone size: its key glyphs, the Duo sizes, offline, an app update, and
// first visits to the apps while the home page's worker is in charge. Exits 1 on a failed check or console error.
//   NODE_PATH=/path/to/node_modules node test/flows.cjs
const { webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { duo } = require('./devices.cjs');

const root = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
let swBump = null;    // when set, sw.js is served with this cache name, like a deploy would
let marker = 'v1';    // put into the home page, to tell an old copy from a new one
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
  if (swBump && p === '/sw.js') body = Buffer.from(body.toString().replace(/const CACHE = '[^']+'/, `const CACHE = '${swBump}'`));
  if (p === '/index.html') body = Buffer.from(body.toString().replace('</body>', `<!--marker:${marker}--></body>`));
  // GitHub Pages lets browsers keep files for 10 minutes, so an update must fetch past the browser's copy
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
  res.end(body);
});

// One key per app, each with its glyph drawn inline
const ICONS = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/\{id:'/g).length;
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !ok ? ' — ' + JSON.stringify(info) : ''}`); };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await webkit.launch();
  const errors = [];
  // TV Mount and Recipes call /api/, which this server does not have; any other error counts
  const watch = p => { p.on('console', m => { if (m.type() === 'error' && !m.location().url.includes('/api/')) errors.push(m.text() + ' ' + m.location().url); }); p.on('pageerror', e => errors.push(e.message)); return p; };
  const ctl = p => p.evaluate(() => navigator.serviceWorker.controller?.scriptURL || '');
  const notice = p => p.$eval('.toast', t => t.classList.contains('tap') && t.classList.contains('on') ? t.textContent : null).catch(() => null);

  // The keys' glyphs are inline: no icon files are fetched, in either theme
  for (const scheme of ['light', 'dark']) {
    const c = await browser.newContext({ ...devices['iPhone 13'], colorScheme: scheme, serviceWorkers: 'block' }), p = watch(await c.newPage());
    const icons = [];
    p.on('request', r => { if (/icon-180/.test(r.url())) icons.push(r.url()); });
    await p.goto(base); await p.waitForLoadState('networkidle');
    check(`${scheme}: no icon files are fetched, and every app key has its glyph`, icons.length === 0 && (await p.$$('.key[data-app] svg.g')).length === ICONS, icons);
    await c.close();
  }

  // The Duo sizes: no sideways scroll, the gadget inside the screen at its one size, every key and the SND switch at least 44 px,
  // and MODE switches the theme
  for (const [size, { width: w, height: h }] of Object.entries(duo)) {
    const dc = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' }), dp = watch(await dc.newPage());
    await dp.goto(base); await dp.waitForSelector('.key');
    const r = await dp.evaluate(() => {
      const d = document.getElementById('dev').getBoundingClientRect();
      const hs = [...document.querySelectorAll('.key, #snd')].map(x => x.getBoundingClientRect().height);
      return { sw: document.documentElement.scrollWidth, devL: d.left, devR: d.right, devW: d.width, minH: Math.min(...hs) };
    });
    check(`${w}×${h} (${size}): no sideways scroll`, r.sw <= w, r);
    check(`${w}×${h} (${size}): the gadget is inside the screen at its one size`, r.devL >= 0 && r.devR <= w && Math.round(r.devW) === 358, r);
    check(`${w}×${h} (${size}): every key and the SND switch are at least 44 px tall`, r.minH >= 44, r);
    const lcdH = () => dp.$eval('#lcd', e => e.getBoundingClientRect().height);
    const before = await lcdH();
    await dp.tap('.key.cat'); await dp.waitForTimeout(300);
    check(`${w}×${h} (${size}): BILLIE shows his photo without changing the screen's height`, await dp.$eval('#lcd', e => e.classList.contains('photo')) && Math.abs((await lcdH()) - before) < 0.5, [before, await lcdH()]);
    // The speaker grille moves the gadget on the open phone (and it stays put after a reload), but not on the narrow screens
    const devBox = () => dp.$eval('#dev', e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
    const g = await dp.$eval('.grille', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    const start = await devBox();
    await dp.mouse.move(g[0], g[1]); await dp.mouse.down(); await dp.mouse.move(g[0] + 120, g[1] + 30, { steps: 5 }); await dp.mouse.up();
    const moved = await devBox();
    if (w >= 560) {
      check(`${w}×${h} (${size}): dragging the grille moves the gadget`, moved[0] - start[0] > 60 && moved[1] - start[1] > 10, [start, moved]);
      await dp.reload(); await dp.waitForSelector('.key');
      check(`${w}×${h} (${size}): the gadget stays where it was dropped after a reload`, JSON.stringify(await devBox()) === JSON.stringify(moved), [moved, await devBox()]);
      const r2 = await dp.$eval('#dev', e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; });
      check(`${w}×${h} (${size}): the moved gadget is still on screen`, r2[0] >= 0 && r2[1] <= w, r2);
      // Easter egg: shaking it hard makes Billie dizzy
      const g2 = await dp.$eval('.grille', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      await dp.mouse.move(g2[0], g2[1]); await dp.mouse.down();
      for (let i = 0; i < 8; i++) await dp.mouse.move(g2[0] + (i % 2 ? -60 : 60), g2[1], { steps: 2 });
      await dp.mouse.up(); await dp.waitForTimeout(500);
      check(`${w}×${h} (${size}): shaking it hard makes Billie dizzy`, await dp.$eval('#bubble', e => e.textContent === '@ _ @'));
      await dp.waitForTimeout(900);
      check(`${w}×${h} (${size}): the gadget is still on screen after the shake`, await dp.$eval('#dev', e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
    } else check(`${w}×${h} (${size}): the grille does not move the gadget`, JSON.stringify(moved) === JSON.stringify(start), [start, moved]);
    await dp.tap('.key.mode');
    check(`${w}×${h} (${size}): MODE switches the theme`, await dp.evaluate(() => document.documentElement.dataset.theme === 'light' && localStorage.getItem('theme') === 'light'));
    await dc.close();
  }
  check('sw.js refreshes past the browser\'s copy (no-cache) inside waitUntil', /no-cache/.test(fs.readFileSync(path.join(root, 'sw.js'), 'utf8')) && /waitUntil\(net/.test(fs.readFileSync(path.join(root, 'sw.js'), 'utf8')));

  const c = await browser.newContext({ ...devices['iPhone 13'] }), p = watch(await c.newPage());
  await p.goto(base);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForTimeout(500);
  check('the home page worker is in charge after a reload', (await ctl(p)).endsWith('/sw.js'));
  check('no update notice on the first install', !(await notice(p)));

  // Offline, in both themes
  await c.setOffline(true);
  const status = await p.reload().then(r => r && r.status(), () => 0);
  await p.waitForTimeout(800);
  const shown = () => p.$$eval('.key[data-app] svg.g', g => g.map(s => s.getBoundingClientRect().width > 0 && s.childElementCount > 0));
  check('opens with the network off, with its glyphs', status === 200 && (await shown()).filter(Boolean).length === ICONS);
  await p.evaluate(() => localStorage.setItem('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  await p.reload(); await p.waitForTimeout(800);
  check('the glyphs are there offline in the other theme too', (await shown()).filter(Boolean).length === ICONS);
  await p.evaluate(() => localStorage.removeItem('theme'));
  await c.setOffline(false);
  check('pages it does not keep come from the network (mycat.html)', (await p.goto(base + 'mycat.html').then(r => r.status())) === 200);
  await p.goto(base); await p.waitForTimeout(300);

  // An update: the notice, the new page in the new cache (not the browser's old copy), and a reload onto it
  marker = 'v2'; swBump = 'home-v999';
  await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  await p.waitForSelector('.toast.tap.on', { timeout: 8000 }).catch(() => {});
  check('an update says "Updated · Tap to reload"', (await notice(p)) === 'Updated · Tap to reload');
  const fresh = await p.evaluate(() => caches.open('home-v999').then(c => c.match('./index.html')).then(r => r && r.text()));
  check('the new cache has the new page, not the browser\'s 10-minute copy', !!fresh && fresh.includes('marker:v2'));
  await Promise.all([p.waitForEvent('load'), p.tap('.toast')]);
  check('tapping it reloads onto the new page', (await p.content()).includes('marker:v2'));
  const keys = await p.evaluate(() => caches.keys());
  check('the old home cache is gone', keys.includes('home-v999') && !keys.some(k => k.startsWith('home-') && k !== 'home-v999'), keys);
  swBump = null;

  // A first visit to an app or Recipes while the home page's worker is in charge: its own worker takes over quietly
  for (const app of ['calculator', 'counter', 'converter', 'triangle', 'tvmount', 'roadtrip', 'parking', 'recipes']) {
    await p.goto(base + app + '/');
    await p.waitForFunction(a => (navigator.serviceWorker.controller?.scriptURL || '').endsWith(`/${a}/sw.js`), app, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(400);
    check(`${app}: its own worker takes over on the first visit, with no update notice`, (await ctl(p)).endsWith(`/${app}/sw.js`) && !(await notice(p)), await ctl(p));
  }
  await c.close();

  check('no console errors', errors.length === 0, errors);
  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
