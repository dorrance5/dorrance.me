// Drives Counter in WebKit at iPhone size: counting, older saved counters, sorting, the early theme, offline and an
// app update. Exits 1 on a failed check or console error.
//   NODE_PATH=/path/to/node_modules node counter/test/flows.cjs
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

  let dialogs = 0;
  page.on('dialog', d => { dialogs++; d.accept(); });   // none expected: Reset and Delete ask in a sheet
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
  check('the viewport allows pinch zoom', !/user-scalable/.test(await page.getAttribute('meta[name=viewport]', 'content')));
  check('light and dark theme-color metas', await page.$$eval('meta[name=theme-color][media]', m => m.length) === 2);
  // A tap writes the number into its card; the list is not rebuilt
  await page.evaluate(() => { document.querySelector('[data-id="a"]').__mark = 1; });
  await page.tap('[data-id="a"]');
  check('a tap keeps the same card element (no list rebuild)', await n('a') === '4' && await page.evaluate(() => document.querySelector('[data-id="a"]').__mark === 1));
  await page.tap('[data-id="a"] [data-action="toggle"]');
  await page.tap('[data-id="a"] [data-action="reset"]');
  check('Reset asks in a sheet, not a browser dialog', await page.evaluate(() => /Reset Boxes to 0\?/.test(document.querySelector('.sheet')?.textContent || '')) && dialogs === 0);
  await page.tap('.sheet [data-act="cancel"]');
  check('Cancel keeps the count', await n('a') === '4' && !(await page.$('.sheet')));
  await page.tap('[data-id="a"] [data-action="reset"]');
  await page.tap('.sheet [data-act="ok"]');
  check('confirming resets it', await n('a') === '0' && !(await page.$('.sheet')) && dialogs === 0);
  await page.tap('#setBtn'); await page.tap('[data-act="wipe"]');
  check('Delete all asks in a sheet first and nothing is deleted yet', await page.evaluate(() => /Delete all 2 counters\?/.test(document.querySelector('.sheet')?.textContent || '')) && (await saved()).length === 2);
  await page.tap('.sheet [data-act="cancel"]');
  await page.reload(); await page.waitForSelector('#n-a');
  const order = () => page.$$eval('#list .card', cs => cs.map(c => c.dataset.id).join());
  await page.tap('#sortBtn'); await page.tap('[data-sort="name"]');
  check('sort by name', await order() === 'b,a');
  await page.tap('#sortBtn'); await page.tap('[data-sort="count"]');
  check('sort by highest count', await order() === 'a,b');
  await page.tap('[data-id="a"] [data-action="toggle"]');
  await page.tap('[data-id="a"] [data-action="reset"]');
  await page.tap('.sheet [data-act="ok"]');
  check('Reset sets it to 0', await n('a') === '0');
  await page.tap('#addBtn'); await page.fill('#fLabel', 'Mounts'); await page.tap('[data-act="save"]');
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

  // iPhone Duo sizes : closed upright, open upright and sideways (CSS px)
  const sized = async (w, h) => { const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }); return { c, p: watch(await c.newPage()) }; };
  const box = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
  const sideways = p => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  for (const [size, cols] of [['closed', 1], ['open', 2], ['openSideways', 3]]) {
    const { width: w, height: h } = duo[size];
    const { c, p } = await sized(w, h);
    await p.addInitScript(() => localStorage.setItem('counter-v1', JSON.stringify({ sort: 'manual', counters: ['a', 'b', 'c', 'd'].map(id => ({ id, name: 'Counter ' + id, color: '#0A57D0', n: 7 })) })));
    await p.goto(base); await p.waitForSelector('#n-a');
    const xs = new Set((await p.$$eval('#list .card', cs => cs.map(c => Math.round(c.getBoundingClientRect().left)))));
    check(`${w}×${h}: ${cols} ${cols === 1 ? 'column' : 'columns'} of counters`, xs.size === cols, [...xs]);
    check(`${w}×${h}: no sideways scrolling`, (await sideways(p)) <= 0);
    const head = await box(p, 'header h1'), bar = await box(p, '#bar'), list = await box(p, '#list');
    check(`${w}×${h}: "Counter" at the top left, +, Edit and sort in a bar at the bottom`, await p.textContent('header h1') === 'Counter' && head.x < 30 && head.y < 40
      && Math.abs(bar.y + bar.h - h) <= 1 && bar.y >= list.y + list.h - 1 && await p.$$eval('#bar button', l => l.map(b => b.id).join()) === 'addBtn,editBtn,sortBtn', { head, bar, list });
    await c.close();
  }

  // The cards (review 4): one number box width, a top row that holds still when a card opens, two-line long names, 44 px buttons
  {
    const { c, p } = await sized(duo.closed.width, duo.closed.height);
    await p.addInitScript(() => localStorage.setItem('counter-v1', JSON.stringify({ sort: 'manual', counters: [
      { id: 'a', name: 'Boxes', color: '#0A57D0', n: 7 }, { id: 'b', name: 'Cats', color: '#D02A2A', n: 12 },
      { id: 'c', name: 'A very long counter name that overflows', color: '#7C3AED', n: 1234 }] })));
    await p.goto(base); await p.waitForSelector('#n-a');
    const nums = await p.$$eval('.num', l => l.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; }));
    check('every number box has the same width and left edge (1, 2 and 4 digits)', new Set(nums.map(n => n.join())).size === 1 && nums[0][1] >= 170, nums);
    const top0 = await box(p, '#n-a');
    await p.tap('[data-id="a"] [data-action="toggle"]');
    const top1 = await box(p, '#n-a');
    check('opening a card keeps its number box where it was', JSON.stringify(top0) === JSON.stringify(top1), { top0, top1 });
    const btns = await p.$$eval('.more button, #bar button, [data-action="toggle"]', l => l.map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim() || b.getAttribute('aria-label'), r.width, r.height]; }).filter(x => x[1] < 44 || x[2] < 44));
    check('−1, Reset, the chevrons and the bottom bar buttons are at least 44 px', btns.length === 0, btns);
    const nm = await p.$eval('[data-id="c"] .name', e => ({ two: e.classList.contains('two'), fs: getComputedStyle(e).fontSize, lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)), cut: e.scrollHeight > e.clientHeight + 1 }));
    check('a long name gets two lines at 17 px before the ellipsis', nm.two && nm.fs === '17px' && nm.lines === 2, nm);
    check('a short name stays on one line at 20 px', await p.$eval('[data-id="a"] .name', e => !e.classList.contains('two') && getComputedStyle(e).fontSize === '20px'));
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
    await p.goto(base); await p.waitForSelector('#addBtn');
    await p.tap('#addBtn'); await p.waitForSelector('#fLabel');
    await p.fill('#fLabel', 'Pallets'); await p.focus('#fLabel');
    await p.evaluate(([kb, o]) => __kb(kb, o), [kh, kbd.offsetTop]); await p.waitForTimeout(600);
    const k = await p.evaluate(kh => {
      const r = document.getElementById('fLabel').getBoundingClientRect(), s = document.querySelector('.sheet').getBoundingClientRect();
      return { kb: document.documentElement.classList.contains('kb'), locked: document.documentElement.classList.contains('locked'), top: r.top, bottom: r.bottom, sTop: s.top, sBottom: s.bottom, lo: visualViewport.offsetTop, vis: visualViewport.offsetTop + visualViewport.height };
    }, kh);
    check(`${tag} keyboard: html.kb is set and the page behind the sheet is locked`, k.kb && k.locked, k);
    check(`${tag} keyboard: the bottom bar is hidden while typing`, await p.evaluate(() => getComputedStyle(document.getElementById('bar')).display === 'none'));
    check(`${tag} keyboard: the open sheet fits the visible area`, k.sTop >= k.lo - 1 && k.sBottom <= k.vis + 1, k);
    check(`${tag} keyboard: the focused field is visible`, k.top >= k.lo - 1 && k.bottom <= k.vis + 1, k);
    await p.tap('.backdrop', { position: { x: 5, y: 5 } }); await p.waitForTimeout(150);
    check(`${tag} keyboard: a backdrop tap while typing only puts the keyboard away`, await p.evaluate(() => !!document.querySelector('.sheet') && document.activeElement !== document.getElementById('fLabel') && document.getElementById('fLabel').value === 'Pallets'));
    await p.tap('.backdrop', { position: { x: 5, y: 5 } }); await p.waitForTimeout(150);
    check(`${tag} keyboard: a second tap closes the sheet`, await p.evaluate(() => !document.querySelector('.backdrop') && !document.documentElement.classList.contains('locked')));
    await p.evaluate(() => __kb(0, 0)); await p.waitForTimeout(200);
    check(`${tag} keyboard: html.kb goes away with the keyboard and the bottom bar is back`, await p.evaluate(() => !document.documentElement.classList.contains('kb') && getComputedStyle(document.getElementById('bar')).display !== 'none'));
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

  {
    const src = fs.readFileSync(path.join(root, 'counter', 'sw.js'), 'utf8');
    check('sw.js: the cache write is awaited and held open with waitUntil', /await cache\.put/.test(src) && /e\.waitUntil\(net/.test(src), src.slice(-600));
    check('sw.js: refreshes the page, JS and CSS only, with no-cache', /no-cache/.test(src) && /navigate/.test(src) && /\(js\|css\)/.test(src));
  }

  {
    const c = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' }), p = await c.newPage();
    await p.goto(base); await p.waitForTimeout(300);
    const miss = await require('../../test/tap44.cjs')(p);
    check('shared controls (seg, tabs, chips, home link) have a 44px tap area', miss.length === 0, miss);
    await p.tap('#addBtn'); await p.waitForSelector('#fLabel');
    const a = await p.evaluate(() => { const e = document.getElementById('fLabel'); return [e.id, e.name, e.autocomplete, e.placeholder, e.getAttribute('aria-label')].join('|'); });
    check('counter label field has no "name" in id, name, placeholder or aria-label', !/name/i.test(a) && /off/.test(a), a);
    await c.close();
  }

  check('no console errors', errors.length === 0, errors);
  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
