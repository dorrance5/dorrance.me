// Drives the home page in WebKit at iPhone size: the icons for the theme that shows, offline, an app update, and
// first visits to the apps while the home page's worker is in charge. Exits 1 on a failed check or console error.
//   NODE_PATH=/path/to/node_modules node test/flows.cjs
const { webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

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

// The app icons on the home page, each in a dark and a light version
const ICONS = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<a class="app"/g).length;
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

  // Only the icons for the theme that shows are fetched
  for (const scheme of ['light', 'dark']) {
    const c = await browser.newContext({ ...devices['iPhone 13'], colorScheme: scheme, serviceWorkers: 'block' }), p = watch(await c.newPage());
    const icons = [];
    p.on('request', r => { if (/icon-180/.test(r.url())) icons.push(r.url()); });
    await p.goto(base); await p.waitForLoadState('networkidle');
    const light = icons.filter(u => u.includes('-light')).length;
    check(`${scheme}: only the ${scheme} icons are fetched`, icons.length === ICONS && light === (scheme === 'light' ? ICONS : 0), icons);
    await c.close();
  }

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
  const shown = () => p.$$eval('.app img', im => im.filter(i => i.offsetParent).map(i => i.complete && i.naturalWidth > 0));
  check('opens with the network off, with its icons', status === 200 && (await shown()).filter(Boolean).length === ICONS);
  await p.evaluate(() => localStorage.setItem('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  await p.reload(); await p.waitForTimeout(800);
  check('the other theme\'s icons are there offline too', (await shown()).filter(Boolean).length === ICONS);
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
