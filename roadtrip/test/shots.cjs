// Phone-size screenshots of Road Trip in WebKit, Day and Night; exits 1 on any console error or page error.
// The API Worker runs in Node (worker/test/harness.cjs) with KV in memory. The cars are test/fixture.json, and the
// clock is Saturday, October 31, 2026. Mitchell and Nicole share the cars; Hayden has an account.
//   NODE_PATH=/path/to/node_modules node roadtrip/test/shots.cjs [outdir]
const { webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'shots'));
fs.mkdirSync(out, { recursive: true });
const CARS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));
const NOW = new Date(2026, 9, 31, 15, 44);
// The file for the import scenes, a Road Trip export made from the cars. RT_ZIP=/path/to/export.zip shows a real one
// instead, which stays out of the repository.
const X = require('./rtexport.cjs');
const EXPORT = process.env.RT_ZIP
  ? { name: path.basename(process.env.RT_ZIP), mimeType: 'application/zip', buffer: fs.readFileSync(process.env.RT_ZIP) }
  : { name: 'Road Trip CSV.zip', mimeType: 'application/zip', buffer: X.zip(CARS.cars.map(c => ({ name: c.name + '.csv', text: X.csv(c) }))) };
// Scene 33 brings the cars over and waits until the Worker has them; the scenes after it find them there.
const bringOver = async p => {
  await ready(p); await p.setInputFiles('#importFile', EXPORT);
  await Promise.all([p.waitForResponse(r => r.url().endsWith('/api/roadtrip') && r.request().method() === 'POST'), p.click('#impGo')]);
};
// Three things deleted lately, for Archived: a fill-up typed in twice, a car wash and an old reminder.
const joseph = CARS.cars.find(c => c.id === 'joseph'), pilot = CARS.cars.find(c => c.id === 'pilot');
joseph.fuel.push({ id: 'fdup', date: '2026-08-29', odo: 135953, gal: 8.821, price: 4.239, total: 37.39, partial: false, reset: false, gone: '2026-10-29' });
joseph.costs.push({ id: 'cwash', date: '2026-10-03', odo: null, name: 'Car wash', kind: 'expense', cost: 14, note: '', gone: '2026-10-30' });
pilot.reminders.push({ id: 'rtires', name: 'Tire rotation', miles: 7500, months: null, gone: '2026-10-12' });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});

const ready = p => p.waitForSelector('#tabbar:not([hidden])');
const tab = t => async p => { await ready(p); await p.click(`#tabbar [data-tab="${t}"]`); };
const chart = c => async p => { await ready(p); await p.waitForSelector('#v-stats .chart'); await p.click(`#v-stats [data-chart="${c}"]`); };
const end = async p => { await p.evaluate(() => { const m = document.getElementById('main'); m.scrollTop = m.scrollHeight; }); };
const fillOn = date => async p => { await tab('fuel')(p); await p.click(`#v-fuel .row:has-text("${date}") >> nth=0`); await p.waitForSelector('#fillLayer'); };
const scenes = [
  ...[[382,844],[669,951],[951,669],[385,844]].flatMap(([width,height]) => ['stats','fuel','costs','more'].map(t => ({ name: `duo-${width}-${t}`, viewport: {width,height}, act: tab(t) }))),
  { name: '01-stats-day', act: ready },
  { name: '02-stats-night', theme: 'dark', act: ready },
  { name: '03-stats-touch-day', act: async p => { await ready(p); const b = await p.locator('#ch').boundingBox(); await p.mouse.move(b.x + b.width * 0.62, b.y + 90); } },
  { name: '04-stats-price-night', theme: 'dark', act: chart('price') },
  { name: '05-stats-permile-day', act: chart('permile') },
  { name: '06-stats-miles-night', theme: 'dark', act: chart('miles') },
  { name: '07-stats-1y-end-day', act: async p => { await ready(p); await p.click('#v-stats [data-range="1y"]'); await end(p); } },
  { name: '08-fuel-day', act: tab('fuel') },
  { name: '09-fuel-night', theme: 'dark', act: tab('fuel') },
  { name: '10-fillup-day', act: fillOn('Jun 11') },
  { name: '11-fillup-night', theme: 'dark', act: fillOn('Jun 11') },
  { name: '12-add-fuel-day', act: async p => { await ready(p); await p.click('#addBtn'); await p.fill('#fOdo', '136241'); await p.locator('#fGal').pressSequentially('9412'); await p.locator('#fPrice').pressSequentially('3899'); } },
  { name: '13-add-fuel-night', theme: 'dark', act: async p => { await tab('fuel')(p); await p.click('#addBtn'); } },
  { name: '14-expenses-day', act: tab('costs') },
  { name: '15-expenses-night', theme: 'dark', act: tab('costs') },
  { name: '16-add-expense-day', act: async p => { await tab('costs')(p); await p.click('#addBtn'); await p.click('#nameChips [data-name="Air filter"]'); } },
  { name: '17-reminder-day', act: async p => { await tab('costs')(p); await p.click('#v-costs .rem >> nth=1'); } },
  { name: '18-more-day', act: tab('more') },
  { name: '19-more-end-day', act: async p => { await tab('more')(p); await p.waitForSelector('.ask, .person'); await end(p); } },
  { name: '20-more-night', theme: 'dark', act: tab('more') },
  { name: '21-cars-day', act: async p => { await ready(p); await p.click('#carBtn'); } },
  { name: '22-cars-night', theme: 'dark', act: async p => { await ready(p); await p.click('#carBtn'); } },
  { name: '23-pilot-stats-day', act: async p => { await ready(p); await p.click('#carBtn'); await p.click('[data-car="pilot"]'); } },
  { name: '28-archived-day', act: async p => { await ready(p); await p.click('#carBtn'); await p.click('.sheet [data-act="archived"]'); } },
  { name: '29-archived-night', theme: 'dark', act: async p => { await tab('more')(p); await p.click('#v-more [data-act="archived"]'); } },
  { name: '30-deleted-toast-day', act: async p => { await tab('costs')(p); await p.click('#v-costs [data-cost] >> nth=0'); await p.click('.sheet [data-del]'); } },
  { name: '31-more-settings-day', act: async p => { await tab('more')(p); await p.waitForSelector('.ask, .person'); await p.locator('#mAuto').scrollIntoViewIfNeeded(); } },
  { name: '24-asked-day', as: 'Hayden', act: async p => { await tab('more')(p); await p.waitForSelector('[data-share="join"]'); } },
  { name: '25-no-cars-day', as: 'Hayden', act: ready },
  { name: '26-signed-out-day', as: null },
  { name: '27-signed-out-night', as: null, theme: 'dark' },
  { name: '32-import-day', as: 'Hayden', act: async p => { await ready(p); await p.setInputFiles('#importFile', EXPORT); await p.waitForSelector('#impGo'); } },
  { name: '33-imported-day', as: 'Hayden', act: bringOver },
  { name: '34-imported-expenses-day', as: 'Hayden', act: tab('costs') },
  { name: '35-imported-pilot-day', as: 'Hayden', act: async p => { await ready(p); await p.click('#carBtn'); await p.click('[data-car="rt-pilot"]'); } },
  { name: '36-imported-pilot-expenses-day', as: 'Hayden', act: async p => { await ready(p); await p.click('#carBtn'); await p.click('[data-car="rt-pilot"]'); await p.click('#tabbar [data-tab="costs"]'); } },
  { name: '37-imported-archived-day', as: 'Hayden', act: async p => { await ready(p); await p.click('#carBtn'); await p.click('.sheet [data-act="archived"]'); } }
];

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${server.address().port}/roadtrip/`;
  const api = await require('../../worker/test/harness.cjs')('{"recipes":[]}');
  await api.addUser('Nicole', 'nicole-password');
  await api.addUser('Hayden', 'hayden-password');
  const PASSWORDS = { Nicole: 'nicole-password', Hayden: 'hayden-password', Mitchell: api.ADMIN_PASSWORD };
  const person = async key => { const u = await api.kv.get('auth:user:' + key, 'json'); return { key, id: u.id, name: u.name }; };
  const mitchell = { key: 'mitchell', id: 'admin', name: 'Mitchell' }, nicole = await person('nicole');
  const put = (k, v) => api.kv.put(k, JSON.stringify(v));
  await put('road:home:hshots', { members: [mitchell, nicole], ...CARS });
  await put('road:me:mitchell', { id: 'admin', home: 'hshots' });
  await put('road:me:nicole', { id: nicole.id, home: 'hshots', asked: await person('hayden') });
  await put('road:me:hayden', { id: (await person('hayden')).id, invite: nicole });
  const browser = await webkit.launch();
  const problems = [];
  for (const sc of scenes) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['iPhone 13'], viewport: sc.viewport || { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const as = 'as' in sc ? sc.as : 'Mitchell';
    let session = null;
    if (as) {
      const res = await api.call('http://x/api/auth/login', { method: 'POST', body: JSON.stringify({ name: as, password: PASSWORDS[as] }) });
      const { token, name, admin } = await res.json();
      session = { token, name, admin };
    }
    await ctx.addInitScript(([theme, session]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
      if (session) localStorage.setItem('dorrance-session', JSON.stringify(session));
    }, [sc.theme || null, session]);
    await ctx.route('**/api/**', api.route);
    const page = await ctx.newPage();
    await page.clock.setFixedTime(NOW);
    page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) problems.push(`${sc.name}: console: ${m.text()}`); });
    page.on('pageerror', e => problems.push(`${sc.name}: page error: ${e.message}`));
    await page.goto(base, { waitUntil: 'load' });
    if (sc.act) await sc.act(page);
    await page.waitForTimeout(sc.wait || 500);
    await page.screenshot({ path: path.join(out, sc.name + '.png') });
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(`${scenes.length} screenshots in ${out}`);
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('No console errors.');
})().catch(e => { console.error(e); process.exit(1); });
