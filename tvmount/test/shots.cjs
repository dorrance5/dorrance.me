// iPhone-size screenshots in WebKit; exits 1 on any console error or page error.
// Needs Playwright (npm i playwright && npx playwright install webkit) somewhere on NODE_PATH:
//   NODE_PATH=/path/to/node_modules node tvmount/test/shots.cjs [outdir]
const { webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../store.js');

const root = path.join(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'shots'));
fs.mkdirSync(out, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // An empty shared library. It is here, not a Playwright route, because routes miss the requests of a page the service worker controls.
  if (p.startsWith('/api/tvmount/lib')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"tvs":[],"mounts":[]}'); return; }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

// A mantle job filled in all the way, so both modes have something to show.
function jobDoc(mode) {
  const d = S.blank();
  d.settings.mode = mode;
  const t = d.tabs[0];
  t.name = 'Living room';
  Object.assign(t.tv, { src: 'measured', model: 'QN65Q80C', w: 57.125, h: 32.75, vesaTop: 7.5, vesaW: 400, vesaH: 300 });
  Object.assign(t.mount, { model: 'Sanus VLT7', holesToTop: 4.5, chain: 'split', hookDrop: 1.25, armDrop: 0.5, sag: 0.125, plateW: 26.5, plateH: 10.75, holeDown: 0.75, rowGap: 8.5, lagSpan: 24, slide: 3, adjUp: 0.5, adjDown: 0.5 });
  t.ref.kind = 'mantle';
  Object.assign(t.ref.mantle, { edge: 'bottom', value: 4, h: 54.25, hR: 54.625, len: 66 });
  Object.assign(t.center, { mode: 'two', from: 'left', a: 30.25, b: 96.5 });
  t.studs.list = [-10.75, 5.25, 21.25];
  Object.assign(t.box, { on: true, w: 7.5, h: 7.5 });
  Object.assign(t.view, { dist: 144 });
  Object.assign(t.built, { top: 37.125 });
  const b = S.addTab(d, 'Primary bedroom');
  Object.assign(b.tv, { src: 'size', size: 55 });
  b.mount.holesToTop = 3.25; b.ref.floor.value = 46;
  S.addTab(d, 'Basement');
  d.current = t.id;
  return d;
}
// Saved TVs and mounts like the ones on the site.
function withLib(d) {
  d.lib.tvs.push({ id: 'v1', model: 'QN80H', w: 56.8125, h: 32.75, vesaTop: 10.5, vesaW: 300, vesaH: 300 });
  d.lib.mounts.push({ id: 'm1', model: 'Kanto RCAD590', hookDrop: 6.5, armDrop: -4.125, slide: 11 });
  return d;
}

const scenes = [
  { name: '01-first-run', seed: null },
  { name: '02-simple', seed: jobDoc('simple') },
  { name: '03-simple-results', seed: jobDoc('simple'), scroll: 330 },
  { name: '04-simple-form', seed: jobDoc('simple'), scroll: 900 },
  { name: '05-simple-keypad', seed: jobDoc('simple'), act: async p => { await p.click('[data-k="ref.mantle.value"]'); await p.waitForTimeout(400); } },
  { name: '06-pro', seed: jobDoc('pro') },
  { name: '07-pro-results', seed: jobDoc('pro'), scroll: 330 },
  { name: '08-pro-results-2', seed: jobDoc('pro'), scroll: 800 },
  { name: '09-pro-form', seed: jobDoc('pro'), scroll: 1500 },
  { name: '10-pro-form-2', seed: jobDoc('pro'), scroll: 2400 },
  { name: '11-pro-form-3', seed: jobDoc('pro'), scroll: 3400 },
  { name: '12-screenshot-mode', seed: jobDoc('pro'), act: async p => { await p.click('#shotBtn'); await p.waitForTimeout(3400); } },
  { name: '13-screenshot-simple', seed: jobDoc('simple'), act: async p => { await p.click('#shotBtn'); await p.waitForTimeout(3400); } },
  { name: '14-pro-night', seed: jobDoc('pro'), theme: 'dark' },
  { name: '15-keypad-night', seed: jobDoc('simple'), theme: 'dark', act: async p => { await p.click('[data-k="ref.mantle.value"]'); await p.click('#kp [data-key="n3"]'); await p.waitForTimeout(400); } },
  { name: '16-menu', seed: jobDoc('pro'), act: async p => { await p.click('#menuBtn'); await p.waitForTimeout(400); } },
  { name: '17-standard-size-floor', seed: (() => { const d = jobDoc('simple'); d.current = d.tabs[1].id; return d; })() },
  { name: '18-soundbar-wall', seed: withBar(jobDoc('simple'), { kind: 'wall', w: 45, h: 3.25, gap: 2.5, holesToTop: 1.5 }, 1) },
  { name: '19-soundbar-wall-results', seed: withBar(jobDoc('simple'), { kind: 'wall', w: 45, h: 3.25, gap: 2.5, holesToTop: 1.5 }, 1), scroll: 330 },
  { name: '20-soundbar-centered-mantle', seed: withBar(jobDoc('pro'), { kind: 'wall', place: 'center', w: 45, h: 3.25, holesToTop: 1.5 }), scroll: 330 },
  { name: '21-soundbar-attachment-night', seed: withBar(jobDoc('simple'), { kind: 'tv', w: 45, h: 3.25 }), theme: 'dark' },
  { name: '23-screenshot-room', seed: (() => { const d = jobDoc('simple'); Object.assign(d.tabs[1].room, { ceil: 108, mantle: 38, left: 52, right: 70 }); d.current = d.tabs[1].id; return d; })(), act: async p => { await p.click('#shotBtn'); await p.waitForTimeout(3400); } },
  { name: '24-screenshot-room-mantle', seed: (() => { const d = jobDoc('simple'); Object.assign(d.tabs[0].room, { ceil: 110, left: 60, right: 66 }); return d; })(), theme: 'dark', act: async p => { await p.click('#shotBtn'); await p.waitForTimeout(3400); } },
  { name: '25-room-card', seed: (() => { const d = jobDoc('simple'); Object.assign(d.tabs[1].room, { ceil: 108, mantle: 38, left: 52, right: 70 }); d.current = d.tabs[1].id; return d; })(), act: async p => { await p.click('[data-fold="room"]'); await p.evaluate(() => document.querySelector('[data-sec="room"]').scrollIntoView()); } },
  { name: '26-screenshot-installer', seed: (() => { const d = jobDoc('pro'); d.settings.shot = 'crew'; return d; })(), act: async p => { await p.click('#shotBtn'); await p.waitForTimeout(3400); } },
  { name: '27-client-soundbar-room', seed: (() => { const d = withBar(jobDoc('simple'), { kind: 'wall', w: 45, h: 3.25, gap: 2.5, holesToTop: 1.5 }, 1); Object.assign(d.tabs[1].room, { ceil: 108, left: 52, right: 70 }); return d; })(), act: async p => { await p.click('#shotBtn'); await p.waitForTimeout(400); } },
  { name: '28-client-sideways', landscape: true, seed: (() => { const d = jobDoc('pro'); Object.assign(d.tabs[0].room, { ceil: 110, left: 60, right: 66 }); return d; })(), act: async p => { await p.click('#shotBtn'); await p.waitForTimeout(3400); } },
  { name: '29-box-in-wall', seed: boxSet(jobDoc('pro')) },
  { name: '30-box-in-wall-form', seed: boxSet(jobDoc('pro')), act: async p => { await p.evaluate(() => document.querySelector('[data-sec="box"]').scrollIntoView()); } },
  { name: '33-box-corner-drawing', seed: boxSet(jobDoc('pro')), act: async p => { await p.evaluate(() => document.querySelector('[data-sec="box"] .plate-fig').scrollIntoView({ block: 'center' })); } },
  { name: '34-vesa-mm-keypad', seed: jobDoc('pro'), act: async p => { await p.evaluate(() => document.querySelector('[data-k="tv.vesaW"]').scrollIntoView({ block: 'center' })); await p.click('[data-k="tv.vesaW"]'); await p.waitForTimeout(400); } },
  { name: '35-whole-distance-ends', seed: (() => { const d = jobDoc('pro'); Object.assign(d.tabs[0].center, { mode: 'half', d: 108 }); return d; })() },
  { name: '36-saved-list', seed: withLib(jobDoc('pro')), act: async p => { await p.click('[data-lib="tv"]'); await p.waitForTimeout(500); } },
  { name: '37-rename', seed: withLib(jobDoc('pro')), act: async p => { await p.click('[data-lib="tv"]'); await p.waitForTimeout(400); await p.click('.sheet [data-ren]'); await p.waitForTimeout(400); } },
  { name: '31-countertop', seed: (() => { const d = jobDoc('simple'); d.tabs[0].ref.mantle.what = 'counter'; Object.assign(d.tabs[0].ref.mantle, { h: 36, value: 18 }); return d; })() },
  { name: '32-countertop-form', seed: (() => { const d = jobDoc('simple'); d.tabs[0].ref.mantle.what = 'counter'; Object.assign(d.tabs[0].ref.mantle, { h: 36, value: 18 }); return d; })(), act: async p => { await p.evaluate(() => document.querySelector('[data-sec="place"]').scrollIntoView()); } },
  { name: '22-soundbar-form', seed: withBar(jobDoc('simple'), { kind: 'wall', w: 45, h: 3.25, gap: 2.5, holesToTop: 1.5 }, 1), act: async p => { await p.evaluate(() => document.querySelector('[data-sec="bar"]').scrollIntoView()); } }
];
// The same job with the box already in the wall, partly behind the plate.
function boxSet(d) { Object.assign(d.tabs[0].box, { place: 'set', corner: 'bl', side: 'left', cornerH: 16, cornerX: 7.75 }); return d; }
// The same job with a soundbar, on the tab at index `on` (0 = the mantle job, 1 = the floor job).
function withBar(d, bar, on = 0) {
  Object.assign(d.tabs[on].bar, bar);
  d.current = d.tabs[on].id;
  return d;
}

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${server.address().port}/tvmount/`;
  const browser = await webkit.launch();
  const problems = [];
  for (const sc of scenes) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2, ...(sc.landscape ? { viewport: { width: 844, height: 390 } } : {}) });
    await ctx.addInitScript(([seed, theme]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      if (seed) localStorage.setItem('tvmount.data', seed);
      if (theme) localStorage.setItem('theme', theme);
    }, [sc.seed ? JSON.stringify(sc.seed) : null, sc.theme || null]);
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') problems.push(`${sc.name}: console: ${m.text()}`); });
    page.on('pageerror', e => problems.push(`${sc.name}: page error: ${e.message}`));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    if (sc.scroll) await page.evaluate(y => { document.getElementById('main').scrollTop = y; }, sc.scroll);
    if (sc.act) await sc.act(page);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(out, sc.name + '.png') });
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(`${scenes.length} screenshots in ${out}`);
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('No console errors.');
})().catch(e => { console.error(e); process.exit(1); });
