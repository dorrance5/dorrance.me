// Phone-size screenshots of the Recipes page in WebKit, Day and Night; exits 1 on any console error or page error.
// The API Worker runs in Node (worker/test/harness.cjs) with a stand-in for GitHub, so nothing is saved. The fonts are in recipes/fonts.
//   NODE_PATH=/path/to/node_modules node recipes/test/shots.cjs [outdir]
const { webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'shots'));
fs.mkdirSync(out, { recursive: true });
// Madi has added three in four of Nicole's recipes to their book; the rest are Shared with you.
const withBooks = text => {
  const d = JSON.parse(text);
  d.books = { madi: d.recipes.filter((r, i) => i % 4 !== 1).map(r => r.id) };
  return JSON.stringify(d, null, 2) + '\n';
};
const FILE = withBooks(fs.readFileSync(path.join(root, 'recipes', 'recipes.json'), 'utf8'));
const MANY = withBooks(require('./many.cjs')(FILE));   // 30 recipes, for the scenes with "many"

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});

const ZUPPA = "Megan's zuppa toscana";
const openRecipe = name => async p => { await p.click(`#deck .rc:has-text("${name}")`); await p.waitForSelector('#view.open'); };
const layerEnd = id => p => p.evaluate(id => { const l = document.getElementById(id); l.scrollTop = l.scrollHeight; }, id);
const cook = name => async p => { await openRecipe(name)(p); await p.click('#cookBtn'); await p.waitForSelector('#cook.open'); };
const settings = async p => { await p.click('#navSettings, #signInBtn >> visible=true'); await p.waitForSelector('#settings.open'); };

// The meal plan in the scenes with `day0`, where it is Saturday, October 24, 2026. Mitchell and Nicole plan the dinners.
const DAY0 = new Date(2026, 9, 24, 18, 0);
const dinner = (recipe, name, by) => ({ recipe, name, by });
const MEALS = {
  days: {
    '2026-10-19': dinner('tacos-and-beans', 'Tacos and beans', 'Mitchell'),
    '2026-10-20': dinner('white-chicken-chili', 'White chicken chili', 'Nicole'),
    '2026-10-21': dinner('salmon-bowls', 'Salmon bowls', 'Nicole'),
    '2026-10-22': { note: 'Leftovers', by: 'Mitchell' },
    '2026-10-23': dinner('burgers-and-fries', 'Burgers and fries', 'Mitchell'),
    '2026-10-24': dinner('megans-zuppa-toscana', ZUPPA, 'Nicole'),
    '2026-10-26': dinner('pepperoncini-roast', 'Pepperoncini roast', 'Nicole'),
    '2026-10-27': dinner('sheet-pan-breakfast-burritos', 'Sheet pan breakfast burritos', 'Mitchell')
  },
  list: {
    recipes: [{ id: 'tacos-and-beans', name: 'Tacos and beans' }, { id: 'burgers-and-fries', name: 'Burgers and fries' }, { id: 'pulled-pork-sandwiches', name: 'Pulled pork sandwiches' }],
    extra: [{ key: 'paper towels', text: 'Paper towels' }],
    got: ['taco seasoning'],
    gone: []
  }
};
const planner = p => p.waitForSelector('#navPlan:not([hidden])');
const tab = go => async p => { await planner(p); await p.click(`#nav [data-go="${go}"]`); await p.waitForSelector(`#${go}.open`); };
const pickDay = date => async p => { await tab('plan')(p); await p.click(`#pDays [data-plan="${date}"]`); await p.waitForSelector('#pick.open'); };
// The bottom of the box: Shared with you
const sharedWithYou = async p => {
  await p.waitForSelector('#others:not([hidden])');
  await p.$eval('#others', s => s.scrollIntoView({ block: 'end' }));
};
// Settings, at "Meal plan and grocery list", once it shows `sel`
const sharing = sel => async p => {
  await planner(p);
  await settings(p);
  await p.waitForSelector('#sShare ' + sel);
  if (await p.isVisible('#sAdmin')) await p.waitForSelector('#sPeople .row');   // the admin's lists, which come first
  await p.$eval('#sMeal', g => g.scrollIntoView({ block: 'center' }));
};
// Who shares in the scenes: Mitchell with Nicole (one plan), Hayden asked Madi, and Madi and Ellie plan alone.
const MADI = {
  days: { '2026-10-23': dinner('madis-pasta-salad', "Madi's pasta salad", 'Madi'), '2026-10-25': { note: 'Dinner at Mom’s', by: 'Madi' } },
  list: { recipes: [{ id: 'madis-pasta-salad', name: "Madi's pasta salad" }], extra: [], got: [], gone: [] }
};
// The import screen, and a file like one an AI assistant makes from three cookbook pages (recipes/import.txt)
const openImport = async p => { await settings(p); await p.click('#sImportBtn'); await p.waitForSelector('#importer.open'); };
const importFile = async p => {
  const file = JSON.stringify({ dorranceRecipes: 1, recipes: [
    { name: 'Banana bread', servings: '1 loaf', tags: ['Bread'], ingredients: ['3 ripe bananas', '1/3 cup melted butter', '3/4 cup sugar', '1 egg', '1 tsp vanilla', '1 tsp baking soda', '1 1/2 cups flour'], steps: ['Heat the oven to 350.', 'Mash the bananas and stir in the butter.', 'Mix in the rest.', 'Bake for 60 minutes.'], source: 'Betty Crocker Cookbook, page 112' },
    { name: 'Salmon bowls', ingredients: ['2 salmon fillets', 'Rice'] },
    { name: 'Buttermilk pancakes', servings: '4', tags: ['Breakfast'], ingredients: ['2 cups flour', '2 cups buttermilk', '2 eggs'], steps: ['Whisk.', 'Cook 2 minutes a side.'] }
  ] }, null, 2);
  await p.setInputFiles('#iFile', { name: 'recipes-import.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await p.waitForSelector('#iFound:not([hidden])');
};
const scenes = [
  { name: '01-box-signed-out-day' },
  { name: '02-box-signed-in-day', as: 'Madi' },
  { name: '03-box-scrolled-day', as: 'Madi', many: true, act: async p => { await p.evaluate(() => scrollTo(0, 700)); } },
  { name: '04-box-soup-day', many: true, act: async p => { await p.click('#tabs [data-tab="Soup"]'); } },
  { name: '05-search-day', act: async p => { await p.fill('#q', 'onion'); } },
  { name: '06-box-night', theme: 'dark', as: 'Madi', many: true },
  { name: '07-recipe-day', act: openRecipe(ZUPPA) },
  { name: '08-recipe-steps-day', as: 'Madi', act: async p => { await openRecipe(ZUPPA)(p); await p.click('#vBody [data-half="steps"]'); } },
  { name: '09-recipe-end-day', act: async p => { await openRecipe(ZUPPA)(p); await layerEnd('view')(p); } },
  { name: '10-recipe-plain-day', act: openRecipe('Burgers and fries') },
  { name: '11-recipe-night', theme: 'dark', as: 'Madi', act: openRecipe('Pepperoncini roast') },
  { name: '12-cooking-night', theme: 'dark', act: cook(ZUPPA) },
  { name: '13-cooking-timer-night', theme: 'dark', act: async p => { await cook(ZUPPA)(p); await p.click('#cGo'); await p.waitForTimeout(2100); await p.click('#cNext'); await p.click('#cNext'); } },
  { name: '14-cooking-ingredients-night', theme: 'dark', act: async p => { await cook(ZUPPA)(p); await p.click('#cIngBtn'); await p.waitForSelector('#cookIng.open'); } },
  { name: '15-cooking-day', act: async p => { await cook('Pepperoncini roast')(p); for (let i = 0; i < 3; i++) await p.click('#cNext'); } },
  { name: '16-new-day', as: 'Madi', act: async p => { await p.click('#addBtn'); await p.waitForSelector('#editor.open'); await p.fill('#fName', 'Grandma’s crème brûlée'); await p.click('#fCats [data-new]'); await p.fill('#fNew', 'Dessert'); } },
  { name: '17-edit-day', as: 'Mitchell', act: async p => { await openRecipe(ZUPPA)(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); } },
  { name: '18-edit-end-night', theme: 'dark', as: 'Mitchell', act: async p => { await openRecipe(ZUPPA)(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); await layerEnd('editor')(p); await p.click('#eDelete'); } },
  { name: '19-save-error-day', as: 'Mitchell', act: async p => { await openRecipe('Salmon bowls')(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); signOutAll(); await p.click('#eSave'); await p.waitForSelector('#eError:not([hidden])'); } },
  { name: '20-settings-admin-day', as: 'Mitchell', act: async p => { await settings(p); await p.waitForSelector('#sWaitList [data-approve]'); } },
  { name: '21-settings-family-night', theme: 'dark', as: 'Madi', act: settings },
  { name: '22-settings-signed-out-day', act: settings },
  { name: '23-ask-account-day', act: async p => { await settings(p); await p.click('#aSwap'); await p.fill('#aName', 'Megan'); await p.fill('#aPass', 'pasta-night-42'); await p.click('#aGo'); await p.waitForSelector('#aResult.ok'); } },
  { name: '24-desktop-day', desktop: true, act: openRecipe(ZUPPA) },
  { name: '25-plan-day', as: 'Mitchell', day0: true, act: tab('plan') },
  { name: '26-plan-next-week-day', as: 'Nicole', day0: true, act: async p => { await tab('plan')(p); await p.click('#pWeeks [data-week="1"]'); } },
  { name: '27-plan-picker-day', as: 'Mitchell', day0: true, act: pickDay('2026-10-25') },
  { name: '28-grocery-day', as: 'Nicole', day0: true, act: tab('grocery') },
  { name: '29-grocery-end-day', as: 'Mitchell', day0: true, act: async p => { await tab('grocery')(p); await layerEnd('grocery')(p); } },
  { name: '30-recipe-add-to-list-day', as: 'Nicole', day0: true, act: async p => { await planner(p); await openRecipe(ZUPPA)(p); await p.$eval('#listBtn', b => b.scrollIntoView({ block: 'center' })); } },
  { name: '31-recipe-on-list-day', as: 'Mitchell', day0: true, act: async p => { await planner(p); await openRecipe('Burgers and fries')(p); } },
  { name: '32-settings-sharing-day', as: 'Mitchell', day0: true, act: sharing('[data-share="leave"]') },
  { name: '33-box-planner-day', as: 'Nicole', day0: true, act: planner },
  { name: '34-plan-night', theme: 'dark', as: 'Mitchell', day0: true, act: tab('plan') },
  { name: '35-plan-picker-night', theme: 'dark', as: 'Nicole', day0: true, act: pickDay('2026-10-25') },
  { name: '36-grocery-night', theme: 'dark', as: 'Mitchell', day0: true, act: tab('grocery') },
  { name: '37-recipe-on-list-night', theme: 'dark', as: 'Nicole', day0: true, act: async p => { await planner(p); await openRecipe('Burgers and fries')(p); } },
  { name: '38-settings-asked-day', as: 'Madi', day0: true, act: sharing('[data-share="join"]') },
  { name: '39-settings-waiting-night', theme: 'dark', as: 'Hayden', day0: true, act: sharing('[data-share="cancel"]') },
  { name: '40-plan-own-day', as: 'Madi', day0: true, act: tab('plan') },
  { name: '41-settings-ask-day', as: 'Ellie', day0: true, act: sharing('[data-ask]') },
  { name: '42-settings-ask-night', theme: 'dark', as: 'Ellie', day0: true, act: sharing('[data-ask]') },
  { name: '43-box-shared-with-you-day', as: 'Madi', act: sharedWithYou },
  { name: '44-recipe-to-add-day', as: 'Madi', act: async p => { await sharedWithYou(p); await p.click('#otherList .sw-open'); await p.waitForSelector('#view.open'); await p.$eval('#vBody .bookbtn', b => b.scrollIntoView({ block: 'center' })); } },
  { name: '45-editor-share-switch-day', as: 'Mitchell', act: async p => { await openRecipe(ZUPPA)(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); await layerEnd('editor')(p); } },
  { name: '46-your-copy-day', as: 'Madi', act: async p => { await openRecipe(ZUPPA)(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); } },
  { name: '47-import-day', as: 'Madi', act: openImport },
  { name: '48-import-found-day', as: 'Madi', act: async p => { await openImport(p); await importFile(p); } },
  { name: '49-import-found-night', theme: 'dark', as: 'Madi', act: async p => { await openImport(p); await importFile(p); await layerEnd('importer')(p); } },
  { name: '50-settings-import-day', as: 'Madi', act: async p => { await settings(p); await p.$eval('#sImport', el => el.scrollIntoView({ block: 'center' })); } },
  { name: '47-box-shared-with-you-night', theme: 'dark', as: 'Madi', act: sharedWithYou }
];
let signOutAll;   // ends every sign-in on the Worker, for the scene where a save finds the sign-in gone

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${server.address().port}/recipes/`;
  const api = await require('../../worker/test/harness.cjs')(FILE);
  await api.addUser('Madi', 'madi-password');
  await api.addUser('Nicole', 'nicole-password');
  await api.addUser('Jen', 'jen-password', true);
  signOutAll = () => { for (const k of [...api.kv.m.keys()]) if (k.startsWith('auth:session:')) api.kv.m.delete(k); };
  await api.addUser('Hayden', 'hayden-password');
  await api.addUser('Ellie', 'ellie-password');
  const PASSWORDS = { Madi: 'madi-password', Nicole: 'nicole-password', Hayden: 'hayden-password', Ellie: 'ellie-password', Mitchell: api.ADMIN_PASSWORD };
  const person = async key => { const u = await api.kv.get('auth:user:' + key, 'json'); return { key, id: u.id, name: u.name }; };
  const mitchell = { key: 'mitchell', id: 'admin', name: 'Mitchell' }, nicole = await person('nicole'), madi = await person('madi'), hayden = await person('hayden');
  const put = (k, v) => api.kv.put(k, JSON.stringify(v));
  await put('meals:plan:pshots', { members: [mitchell, nicole], ...MEALS });
  await put('meals:me:mitchell', { id: 'admin', plan: 'pshots' });
  await put('meals:me:nicole', { id: nicole.id, plan: 'pshots' });
  await put(`meals:plan:solo.madi.${madi.id}`, { members: [madi], ...MADI });
  await put('meals:me:madi', { id: madi.id, invite: hayden });
  await put('meals:me:hayden', { id: hayden.id, asked: madi });
  const browser = await webkit.launch();
  const problems = [];
  for (const sc of scenes) {
    // The service worker is off: Playwright routes miss the requests of a page it controls.
    const ctx = await browser.newContext({ serviceWorkers: 'block', ...(sc.desktop
      ? { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }
      : { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }) });
    let session = null;
    if (sc.as) {
      const res = await api.call('http://x/api/auth/login', { method: 'POST', body: JSON.stringify({ name: sc.as, password: PASSWORDS[sc.as] }) });
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
    if (sc.many) {
      await ctx.route('**/recipes/recipes.json', r => r.fulfill({ contentType: 'application/json', body: MANY }));
      api.gh.text = MANY;
    } else api.gh.text = FILE;
    const page = await ctx.newPage();
    if (sc.day0) await page.clock.setFixedTime(DAY0);   // Date.now() stands still; the timers run
    page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) problems.push(`${sc.name}: console: ${m.text()}`); });
    page.on('pageerror', e => problems.push(`${sc.name}: page error: ${e.message}`));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('#deck .rc, #others:not([hidden])');   // a book, or only recipes shared with you
    await page.evaluate(() => document.fonts.ready);
    if (sc.act) await sc.act(page);
    await page.waitForTimeout(sc.wait || 600);
    await page.screenshot({ path: path.join(out, sc.name + '.png') });
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(`${scenes.length} screenshots in ${out}`);
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('No console errors.');
})().catch(e => { console.error(e); process.exit(1); });
