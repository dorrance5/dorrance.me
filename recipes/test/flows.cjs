// Drives the Recipes page in WebKit at 390 × 844 against the API Worker run in Node (worker/test/harness.cjs), with a stand-in for GitHub:
// the recipe box and its dividers, search, a recipe, cooking mode and its timers, theme, accounts and the admin, add, edit,
// delete, a 409, errors and the back button; then the meal plan and the grocery list on two phones (the admin and the
// partner), the partner chips, batches, no connection, a busy Worker, and losing the tabs.
// Exits 1 on a failed check or a console error.
//   NODE_PATH=/path/to/node_modules node recipes/test/flows.cjs
const { webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
// A frozen copy of the recipe book, so that the family's edits to recipes.json do not change what the checks expect.
// It stands in for recipes.json on the site and on GitHub.
const FILE = fs.readFileSync(path.join(__dirname, 'fixture-recipes.json'), 'utf8');
const site = { text: FILE };   // recipes.json on the site, for a page that is signed out
const D = require('../data.js');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let swBump = null;   // when set, sw.js is served with this cache name, like a deploy would
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
  if (swBump && p === '/recipes/sw.js') body = Buffer.from(body.toString().replace(/const CACHE = '[^']+'/, `const CACHE = '${swBump}'`));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !ok ? ' — ' + JSON.stringify(info) : ''}`); };
const decoded = body => Buffer.from(body.content, 'base64').toString('utf8');
const recipeIn = (text, id) => JSON.parse(text).recipes.find(r => r.id === id);
const ZUPPA = "Megan's zuppa toscana";
const TOMATO = 'rgb(198, 58, 36)', CARROT = 'rgb(224, 123, 46)', BUTTER = 'rgb(246, 201, 69)';

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/recipes/`;
  const api = await require('../../worker/test/harness.cjs')(FILE), gh = api.gh;
  await api.addUser('Madi', 'madi-password');
  await api.addUser('Jen', 'jen-password', true);
  const user = key => api.kv.get('auth:user:' + key, 'json');
  const sessions = () => [...api.kv.m.keys()].filter(k => k.startsWith('auth:session:')).length;
  const browser = await webkit.launch();
  const phone = { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } };
  async function newContext(more) {
    // The service worker is off: Playwright routes miss the requests of a page it controls. The offline checks turn it on.
    const ctx = await browser.newContext({ ...phone, serviceWorkers: 'block', ...more });
    await ctx.route('**/recipes/recipes.json', r => r.fulfill({ contentType: 'application/json', body: site.text }));
    await ctx.route('**/api/**', api.route);
    // a wake lock that counts, and a vibration that counts
    await ctx.addInitScript(() => {
      window.__wake = { requests: 0, releases: 0 };
      window.__buzz = 0;
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
        __wake.requests++;
        const s = new EventTarget();
        s.release = async () => { __wake.releases++; s.dispatchEvent(new Event('release')); };
        return s;
      } } });
      navigator.vibrate = () => { __buzz++; return true; };
    });
    return ctx;
  }
  const ctx = await newContext();
  // a GitHub token left on the phone from before accounts, which the page removes
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('old')) { sessionStorage.setItem('old', '1'); localStorage.setItem('recipes-token', 'github_pat_OLD'); } });
  const page = await ctx.newPage();
  const errors = [];
  // A failed status from the API shows in the console as "Failed to load resource"; that is the test, not a bug.
  const watch = p => {
    p.on('console', m => { if (m.type() === 'error' && !(/^Failed to load resource/.test(m.text()) && /\/api\//.test(m.location().url || ''))) errors.push(m.text()); });
    p.on('pageerror', e => errors.push(e.message));
  };
  watch(page);
  const urls = [];
  page.on('request', r => urls.push(r.url()));
  let answer = null;   // the reply to the next confirm()
  const asked = [];
  page.on('dialog', d => { asked.push(d.message()); (answer ? d.accept() : d.dismiss()).catch(() => {}); answer = null; });

  const names = (p = page) => p.$$eval('#deck .rc .nm', els => els.map(e => e.textContent));
  const tap = sel => page.tap(sel);
  const opened = (id, p = page) => p.waitForSelector(`#${id}.open`);
  const closed = (id, p = page) => p.waitForSelector(`#${id}`, { state: 'hidden' });
  const openRecipe = async (name, p = page) => { await p.tap(`#deck .rc:has-text("${name}")`); await opened('view', p); };
  const text = sel => page.textContent(sel);
  const bg = sel => page.$eval(sel, el => getComputedStyle(el).backgroundColor);
  const pressed = sel => page.$$eval(sel, els => els.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent.trim()));
  const depth = () => page.evaluate(() => (history.state && history.state.sheets) || 0);
  const paste = (sel, t) => page.evaluate(([sel, t]) => {
    const ta = document.querySelector(sel);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return ta.value;
  }, [sel, t]);
  // Phone rules for whatever is on screen now.
  async function phoneRules(where, p = page) {
    const r = await p.evaluate(() => {
      const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert], [hidden]');
      // a checkbox in a label: the label is what a finger taps
      const target = el => { const l = el.closest('label'); return l && el.type === 'checkbox' ? l : el; };
      const small = [...document.querySelectorAll('button, a, input, textarea')].filter(visible)
        .map(el => ({ el, b: target(el).getBoundingClientRect() })).filter(({ b }) => b.height < 44 || b.width < 44)
        .map(({ el, b }) => `${el.id || el.className || el.tagName} ${Math.round(b.width)}x${Math.round(b.height)}`);
      const fonts = [...document.querySelectorAll('input, textarea')].filter(visible).map(el => parseFloat(getComputedStyle(el).fontSize)).filter(s => s < 16);
      const wide = [...document.querySelectorAll('.layer')].filter(visible).filter(l => l.scrollWidth > l.clientWidth + 1).map(l => l.id);
      return { small, fonts, sideways: document.documentElement.scrollWidth - innerWidth, wide };
    });
    check(`${where}: tap targets are 44 px or more`, r.small.length === 0, r.small);
    check(`${where}: inputs are 16 px or more, so iOS does not zoom`, r.fonts.length === 0, r.fonts);
    check(`${where}: no sideways scroll at 390`, r.sideways <= 0 && r.wide.length === 0, r);
  }
  // Each card in the deck: how much of it shows above the next card, and which card a tap there reaches.
  const deck = (p = page) => p.evaluate(() => {
    const cards = [...document.querySelectorAll('#deck .rc')];
    const at = (x, y) => { const c = document.elementFromPoint(x, y)?.closest('.rc'); return c ? cards.indexOf(c) : -1; };
    return cards.map((c, i) => {
      const b = c.getBoundingClientRect(), shows = cards[i + 1] ? cards[i + 1].getBoundingClientRect().top - b.top : b.height;
      return { i, top: b.top, shows, onIt: b.top + shows / 2 < innerHeight ? at(b.left + 60, b.top + shows / 2) : i };
    });
  });

  /* ---- reading, signed out ---- */
  await page.goto(base);
  await page.waitForSelector('#deck .rc');
  const first = await names();
  check('11 recipes from the site file, sorted by name', first.length === 11 && first.join() === [...first].sort((a, b) => a.localeCompare(b)).join(), first);
  check('the file comes from the site without a sign-in', gh.gets === 0);
  check('an old GitHub token is removed from the phone', (await page.evaluate(() => localStorage.getItem('recipes-token'))) === null);
  check('signed out: no tab bar, and Sign in in the header in place of +', await page.isHidden('#nav') && await page.isVisible('#signInBtn') && await page.isHidden('#addBtn'));
  const tabLabels = () => page.$$eval('#tabs button', bs => bs.map(b => b.firstElementChild.textContent + ' ' + b.lastElementChild.textContent));
  const tabs = await tabLabels();
  check('dividers: All on the left, then each category with its count', tabs.join('|') === 'All 11|Crock pot 1|Soup 1', tabs);
  check('All is open', (await pressed('#tabs button')).join() === 'All11');
  const cardBg = async name => page.$eval(`#deck .rc:has-text("${name}")`, el => getComputedStyle(el).backgroundColor);
  check('cards take their category color: Soup tomato, Crock pot carrot, none butter',
    (await cardBg(ZUPPA)) === TOMATO && (await cardBg('Pepperoncini')) === CARROT && (await cardBg('Burgers')) === BUTTER);
  check('a card with a category shows it', (await text(`#deck .rc:has-text("${ZUPPA}") .tg`)) === 'Soup' && !(await page.$('#deck .rc:has-text("Burgers") .tg')));
  const strips = (await deck()).slice(0, -1).filter(c => c.top + c.shows < 844);
  check('each card shows a strip of 44 px or more, and a tap there opens that card', strips.length >= 6 && strips.every(c => c.shows >= 44 && c.onIt === c.i), strips);
  await phoneRules('recipe box');
  check('the browser bar is tomato over the header', (await page.$eval('meta[name="theme-color"]', m => m.content)) === TOMATO);

  /* ---- dividers and search ---- */
  await tap('#tabs [data-tab="Soup"]');
  check('the Soup divider shows only soups, and the band under it is tomato', (await names()).join() === ZUPPA && (await bg('#band')) === TOMATO && (await pressed('#tabs button')).join() === 'Soup1');
  await page.fill('#q', 'chili');
  check('a search in a divider with nothing found says so', (await text('#none')) === 'No recipe under Soup has “chili”.' && await page.isVisible('#none'));
  await tap('#tabs [data-tab=""]');
  check('All again: the search finds White chicken chili', (await names()).join() === 'White chicken chili');
  await page.fill('#q', 'onion');
  const hits = await page.$$eval('#deck .rc', cs => cs.map(c => [c.querySelector('.nm').textContent, c.querySelector('.hit')?.innerHTML || '']));
  check('a search for an ingredient shows why each card matched', hits.length === 4 && hits.every(([, h]) => /<mark>onion<\/mark>/i.test(h)), hits);
  const hitStrips = (await deck()).slice(0, -1);
  check('cards with a reason still show their name and the reason above the next card', hitStrips.every(c => c.shows >= 64 && c.onIt === c.i), hitStrips);
  await page.fill('#q', 'zzz');
  check('nothing found: says so', (await text('#none')) === 'No recipe has “zzz”.');
  await tap('#qClear');
  check('the clear button empties the search', (await page.inputValue('#q')) === '' && (await names()).length === 11 && await page.isHidden('#qClear'));

  /* ---- one recipe ---- */
  await openRecipe(ZUPPA);
  check('the recipe opens as an index card with its name', (await text('#vName')) === ZUPPA);
  check('chips: the category, then Serves', (await page.$$eval('#vBody .chip', cs => cs.map(c => c.textContent))).join('|') === 'Soup|Serves 6');
  check('the card has a tomato strip', (await bg('#vBody .strip')) === TOMATO);
  const ings = await page.$$eval('#vBody .half.ing .lines li', ls => ls.map(l => [l.querySelector('strong')?.textContent || '', l.querySelector('span').textContent]));
  check('ingredients: the amount in bold, ¼ for 1/4, and none for "Salt and pepper"',
    ings.length === 11 && ings[0].join('|') === '5 strips|bacon (thick-cut)' && ings[7].join('|') === '¼ tsp|Italian seasoning' && ings[10].join('|') === '|Salt and pepper', ings);
  check('signed out: no Edit button', await page.isHidden('#editBtn'));
  check('the notes and the link to where it is from', (await text('#vBody .notes p')).startsWith('Hot Italian sausage') &&
    (await page.$eval('#vBody a.source', a => [a.textContent.trim(), a.target, a.rel].join('|'))) === 'From saltandlavender.com|_blank|noopener');
  check('the screen stays on while a recipe is open', (await page.evaluate(() => __wake.requests)) === 1);
  check('the page behind is inert', await page.$eval('#page', p => p.inert));
  await tap('#vBody [data-half="steps"]');
  const steps = await page.$$eval('#vBody .steps li', ls => ls.map(l => l.querySelector('.num').textContent + ' ' + l.lastElementChild.textContent));
  check('Steps shows the 9 numbered steps', steps.length === 9 && steps[0].startsWith('1 Cut the bacon') && (await pressed('#vBody [data-half]')).join() === 'Steps · 9', steps[0]);
  check('Steps keeps the focus on its button', await page.evaluate(() => document.activeElement.dataset.half === 'steps'));
  await tap('#vBody [data-half="ing"]');
  await phoneRules('recipe');
  await page.goBack();
  await closed('view');
  check('back closes the recipe and gives the focus back to its card', (await page.evaluate(() => document.activeElement.dataset.id)) === 'megans-zuppa-toscana');
  check('the screen may sleep again', (await page.evaluate(() => __wake.releases)) === 1);
  await openRecipe('Burgers');
  check('a recipe with no steps: no Steps button, no Start cooking', !(await page.$('#vBody .seg')) && !(await page.$('#cookBtn')) && (await page.$$('#vBody .lines li')).length === 3);
  await tap('#view [data-close]');
  await closed('view');
  check('the back button on the screen leaves no extra history', (await depth()) === 0);
  await openRecipe("Jen's tortellini");
  check('a recipe with no ingredients says so', (await text('#vBody')).includes('No ingredients yet.'));
  await page.keyboard.press('Escape');
  await closed('view');

  /* ---- cooking mode ---- */
  await openRecipe(ZUPPA);
  const released = await page.evaluate(() => __wake.releases);
  await tap('#cookBtn');
  await opened('cook');
  check('cooking mode: step 1 of 9, one step at a time', (await text('#cKick')) === 'Step 1 of 9' && (await text('#cText')).startsWith('Cut the bacon') && (await text('#cName')) === ZUPPA);
  check('the progress bar has 9 parts, 1 done', (await page.$$eval('#cProgress span', s => [s.length, s.filter(x => x.className === 'done').length].join())) === '9,1');
  check('a step with "5 minutes" has a 5:00 timer', await page.isVisible('#cTimer') && (await text('#cClock')) === '5:00' && (await text('#cWhat')) === '5 min in this step' && (await text('#cGo')) === 'Start');
  check('Back is off on the first step', await page.$eval('#cBack', b => b.disabled));
  await phoneRules('cooking');
  await tap('#cNext');
  check('Next step: step 2, a 15-minute timer', (await text('#cKick')) === 'Step 2 of 9' && (await text('#cClock')) === '15:00');
  await tap('#cNext');
  check('a step with no time has no timer', (await text('#cKick')) === 'Step 3 of 9' && await page.isHidden('#cTimer'));
  await tap('#cNext');
  check('"2 to 3 minutes" starts at 2:00 and says the range', (await text('#cClock')) === '2:00' && (await text('#cWhat')) === '2–3 min in this step');
  await page.keyboard.press('ArrowLeft');
  check('the left arrow key goes back a step', (await text('#cKick')) === 'Step 3 of 9');
  await tap('#cBack');
  await tap('#cBack');
  await tap('#cGo');
  await page.waitForTimeout(1300);
  const ran = await text('#cClock');
  check('Start counts down', ran === '4:59' || ran === '4:58', ran);
  check('and Start turns into Pause', (await text('#cGo')) === 'Pause');
  await tap('#cGo');
  const paused = await text('#cClock');
  await page.waitForTimeout(1200);
  check('Pause stops it, and the button says Resume', (await text('#cClock')) === paused && (await text('#cGo')) === 'Resume');
  await tap('#cGo');
  await tap('#cNext');
  await tap('#cNext');
  check('on another step, a button shows the timer that runs', await page.isVisible('#cElse') && /^Step 1 timer · 4:5\d$/.test(await text('#cElse')), await text('#cElse'));
  await tap('#cElse');
  check('and it goes back to that step', (await text('#cKick')) === 'Step 1 of 9' && await page.isHidden('#cElse'));
  await tap('#cReset');
  check('Reset puts the timer back to 5:00', (await text('#cClock')) === '5:00' && (await text('#cGo')) === 'Start');
  await tap('#cIngBtn');
  await opened('cookIng');
  check('Ingredients opens over cooking mode with all 11', (await page.$$('#ciList li')).length === 11 && (await page.$eval('#cook', c => c.inert)));
  await phoneRules('cooking ingredients');
  await tap('#cookIng [data-close]');
  await closed('cookIng');
  check('Close goes back to the step', (await text('#cKick')) === 'Step 1 of 9' && (await depth()) === 2);
  await tap('#cGo');
  answer = false;
  await page.goBack();
  await page.waitForTimeout(200);
  check('leaving with a timer that runs asks first; No stays', asked.at(-1) === 'A timer is running. Stop it and leave cooking mode?' && await page.isVisible('#cook.open') && (await depth()) === 2);
  for (let i = 0; i < 8; i++) await tap('#cNext');
  check('the last step has Done', (await text('#cKick')) === 'Step 9 of 9' && (await text('#cNext')).trim() === 'Done');
  answer = true;
  await tap('#cNext');
  await closed('cook');
  check('Done asks about the timer, then goes back to the recipe', asked.at(-1).startsWith('A timer is running') && await page.isVisible('#view.open') && (await depth()) === 1);
  check('the screen stays on from the recipe through cooking mode and back', (await page.evaluate(() => __wake.releases)) === released);
  await page.goBack();
  await closed('view');

  // iPhone Duo sizes (CSS px). Closed: the tab bar picks ingredients or steps. Open upright: both side by side, no tab
  // bar. Open sideways: the box stays on the left and the recipe opens beside it.
  for (const [w, h, kind] of [[382, 580, 'phone'], [594, 368, 'phone'], [669, 867, 'both'], [951, 585, 'beside']]) {
    const c = await newContext({ viewport: { width: w, height: h } }), p = await c.newPage();
    watch(p);
    await p.goto(base); await p.waitForSelector('#deck .rc');
    await openRecipe('zuppa', p); await p.waitForTimeout(400);
    const shows = await p.evaluate(() => {
      const vis = el => !!el && el.getClientRects().length > 0, r = s => document.querySelector(s).getBoundingClientRect();
      return { seg: vis(document.querySelector('#view .seg')), ing: vis(document.querySelector('#view .half.ing .lines')), steps: vis(document.querySelector('#view .half.steps .lines')),
        ingL: r('#view .half.ing').left, stepsL: r('#view .half.steps').left, ingB: r('#view .half.ing').bottom, stepsT: r('#view .half.steps').top,
        pageR: r('#page').right, viewL: r('#view').left, pageInert: document.getElementById('page').inert };
    });
    if (kind === 'phone') check(`${w}×${h}: the tab bar shows the ingredients only`, shows.seg && shows.ing && !shows.steps, shows);
    else check(`${w}×${h}: ingredients and steps both show, no tab bar`, !shows.seg && shows.ing && shows.steps, shows);
    if (kind === 'both') check(`${w}×${h}: ingredients and steps side by side`, shows.stepsL > shows.ingL + 200, shows);
    if (kind === 'beside') {
      check(`${w}×${h}: steps under the ingredients, beside the box`, shows.stepsT >= shows.ingB - 1 && shows.viewL >= shows.pageR - 1 && shows.viewL < w * .5 && !shows.pageInert, shows);
      check(`${w}×${h}: the open card is marked`, await p.$eval('#deck .rc[aria-current]', el => el.textContent.includes('zuppa')));
      await p.tap('#deck .rc:has-text("Pepperoncini")'); await p.waitForTimeout(300);
      check(`${w}×${h}: another card shows that recipe, one history entry`, (await p.textContent('#vName')) === 'Pepperoncini roast' && (await p.evaluate(() => history.state && history.state.sheets)) === 1
        && await p.$eval('#deck .rc[aria-current]', el => el.textContent.includes('Pepperoncini')));
      await p.setViewportSize({ width: 585, height: 951 }); await p.waitForTimeout(400);   // turned upright
      check('turned upright, the recipe covers the box again', await p.evaluate(() => document.getElementById('page').inert && !document.querySelector('#deck .rc[aria-current]')));
      await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(400);
      await p.tap('#view [data-close]'); await closed('view', p);
      check('Recipe box closes it and the box fills the screen', await p.evaluate(() => !document.getElementById('page').inert && document.getElementById('page').getBoundingClientRect().width > 600 && !document.documentElement.classList.contains('side')));
    }
    await c.close();
  }

  // the end of a timer, on a clock the test moves
  {
    const c3 = await newContext(), p3 = await c3.newPage();
    watch(p3);
    await p3.clock.install();
    await p3.goto(base);
    await p3.waitForSelector('#deck .rc');
    await openRecipe('Pepperoncini', p3);
    await p3.tap('#cookBtn');
    await opened('cook', p3);
    for (let i = 0; i < 3; i++) await p3.tap('#cNext');
    check('"6 hours" is a 6:00:00 timer', (await p3.textContent('#cClock')) === '6:00:00' && (await p3.textContent('#cWhat')) === '6 hr in this step');
    await p3.tap('#cGo');
    await p3.clock.fastForward('01:00:00');
    check('an hour later it shows 5:00:00', (await p3.textContent('#cClock')) === '5:00:00', await p3.textContent('#cClock'));
    await p3.clock.fastForward('05:00:01');
    check('at the end: "Time’s up", 0:00, the phone buzzes, and the button says Again',
      (await p3.textContent('#cWhat')) === 'Time’s up' && (await p3.textContent('#cClock')) === '0:00' && (await p3.evaluate(() => __buzz)) === 1 && (await p3.textContent('#cGo')) === 'Again');
    await c3.close();
  }

  /* ---- theme ---- */
  await tap('#signInBtn');
  await opened('settings');
  check('signed out, Settings has a back button to the box and no tab bar', await page.isVisible('#sBack') && (await text('#sBackText')) === 'Recipe box' && await page.isHidden('#nav'));
  check('Settings shows the sign-in form', await page.isVisible('#aForm') && await page.isHidden('#sMe'));
  check('Theme: Auto, Day, Night, with Auto on the left and picked', (await page.$$eval('#themeSeg button', bs => bs.map(b => b.textContent).join())) === 'Auto,Day,Night' && (await pressed('#themeSeg button')).join() === 'Auto');
  await tap('#themeSeg [data-t="dark"]');
  check('Night: saved for the whole site, and the page turns dark', (await page.evaluate(() => [localStorage.getItem('theme'), document.documentElement.dataset.theme].join())) === 'dark,dark' && (await bg('body')) === 'rgb(28, 21, 18)');
  await phoneRules('settings');
  await tap('#themeSeg [data-t="auto"]');
  check('Auto follows the phone', (await page.evaluate(() => [localStorage.getItem('theme'), document.documentElement.dataset.theme || ''].join())) === 'auto,' && (await bg('body')) === 'rgb(251, 243, 228)');
  await page.evaluate(() => localStorage.setItem('theme', 'aurora'));
  await page.reload();
  await page.waitForSelector('#deck .rc');
  check('Aurora from the apps shows as Night here', (await bg('body')) === 'rgb(28, 21, 18)');
  await tap('#signInBtn');
  await opened('settings');
  check('and Settings shows Night picked, without changing the saved Aurora', (await pressed('#themeSeg button')).join() === 'Night' && (await page.evaluate(() => localStorage.getItem('theme'))) === 'aurora');
  await tap('#themeSeg [data-t="light"]');
  check('Day', (await bg('body')) === 'rgb(251, 243, 228)' && (await page.evaluate(() => localStorage.getItem('theme'))) === 'light');

  /* ---- accounts ---- */
  const signIn = async (name, pw) => { await page.fill('#aName', name); await page.fill('#aPass', pw); await tap('#aGo'); };
  const said = () => page.waitForFunction(() => !document.getElementById('aResult').hidden || !document.getElementById('sMe').hidden).then(() => text('#aResult'));
  await signIn('Madi', 'wrong-password');
  check('a wrong password says so', (await said()) === 'That name and password do not match.');
  await signIn('Jen', 'jen-password');
  await page.waitForFunction(() => document.getElementById('aResult').textContent.includes('waiting'));
  check('an account that waits says so', (await text('#aResult')) === 'Your account is waiting for approval.');
  await tap('#aSwap');
  check('New here? switches the form to asking for an account', (await text('#aTitle')) === 'Ask for an account' && (await text('#aGo')) === 'Ask for an account' && (await page.$eval('#aPass', i => i.autocomplete)) === 'new-password');
  await signIn('Megan', 'short');
  check('a short password is turned down on the phone', (await text('#aResult')) === 'Use 8 characters or more for your password.');
  await signIn('Megan', 'pasta-night-42');
  await page.waitForSelector('#aResult.ok');
  check('asking for an account: thanks, and who approves it', (await text('#aResult')) === 'Thanks, Megan. Your account is waiting for Mitchell. You can sign in once it’s approved.' && (await user('megan')).status === 'pending');
  check('the form goes back to Sign in', (await text('#aTitle')) === 'Sign in');
  await signIn('Madi', 'madi-password');
  await page.waitForSelector('#sMe:not([hidden])');
  const sess = await page.evaluate(() => JSON.parse(localStorage.getItem('dorrance-session')));
  check('signed in: the You card says who', (await text('#sMeName')) === 'Madi' && (await text('#sMeRole')) === 'Signed in' && sess.name === 'Madi' && !sess.admin);
  await page.waitForSelector('#navPlan:not([hidden])');   // once Madi's own meal plan has loaded
  check('signed in: the tab bar shows Recipes, Meal plan, Grocery list and Settings, Settings picked, and no back button',
    await page.isVisible('#nav') && (await page.$$eval('#nav button:not([hidden])', bs => bs.map(b => b.textContent.trim() + (b.getAttribute('aria-current') ? '*' : '')).join())) === 'Recipes,Meal plan,Grocery list,Settings*' && await page.isHidden('#sBack'));
  check('only the admin sees the accounts', await page.isHidden('#sAdmin'));
  check('the password is gone from the form', (await page.inputValue('#aPass')) === '');
  await tap('#nav [data-go="box"]');
  await closed('settings');
  check('Recipes in the tab bar goes back to the box', (await depth()) === 0 && (await page.$eval('#nav [data-go="box"]', b => b.getAttribute('aria-current'))) === 'page');
  check('signed in: + in the header', await page.isVisible('#addBtn') && await page.isHidden('#signInBtn'));
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  const clear = await page.evaluate(() => document.querySelector('#deck li:last-child').getBoundingClientRect().bottom <= document.getElementById('nav').getBoundingClientRect().top);
  check('the last card scrolls clear of the tab bar', clear);
  await page.evaluate(() => scrollTo(0, 0));
  await phoneRules('recipe box, signed in');

  /* ---- add ---- */
  await tap('#addBtn');
  await opened('editor');
  check('+ opens a new recipe, with the keyboard on the name', (await text('#eTitle')) === 'New recipe' && await page.evaluate(() => document.activeElement.id === 'fName') && await page.isHidden('#eDelete'));
  check('Category: None on the left and picked', (await page.$$eval('#fCats button', bs => bs.map(b => b.textContent.trim()).join())) === 'None,Crock pot,Soup,New' && (await pressed('#fCats button')).join() === 'None');
  await phoneRules('editor');
  await tap('#eSave');
  check('Save with no name asks for one', (await text('#eError')) === 'Give the recipe a name.' && await page.$eval('#fName', i => i.classList.contains('bad')) && gh.puts.length === 0);
  await page.fill('#fName', 'Grandma’s crème brûlée');
  await tap('#fCats [data-cat="Soup"]');
  check('picking Soup unpicks None', (await pressed('#fCats button')).join() === 'Soup');
  await tap('#fCats [data-cat="Soup"]');
  check('unpicking it picks None again', (await pressed('#fCats button')).join() === 'None');
  await tap('#fCats [data-new]');
  check('New shows a field for a new category', await page.isVisible('#fNew') && await page.evaluate(() => document.activeElement.id === 'fNew'));
  await page.fill('#fNew', 'Dessert');
  await page.press('#fNew', 'Enter');
  check('the new category is added and picked', (await pressed('#fCats button')).join() === 'Dessert' && await page.isHidden('#fNew'));
  await page.fill('#fServings', '4');
  const pasted = await paste('#fIngredients', '- 4 egg yolks\n- 2 cups heavy cream\n• 1/2 cup sugar\n▢ 1 tsp vanilla');
  check('a pasted list loses its marks', pasted === '4 egg yolks\n2 cups heavy cream\n1/2 cup sugar\n1 tsp vanilla', pasted);
  check('the count under Ingredients', (await text('#fIngHint')) === 'One per line · 4 ingredients');
  await paste('#fSteps', '1. Heat the oven to 325.\n2. Bake 40 minutes.');
  await page.fill('#fSource', 'Grandma Dorrance');
  await tap('#eSave');
  await page.waitForSelector('#view.open');
  await closed('editor');
  let put = gh.puts.at(-1);
  const brulee = recipeIn(decoded(put), 'grandmas-creme-brulee');
  check('add: the recipe is saved in file order, with Madi as its owner, and a source that is not a link stays as typed', JSON.stringify(brulee) === JSON.stringify({ id: 'grandmas-creme-brulee', name: 'Grandma’s crème brûlée', servings: '4', tags: ['Dessert'], ingredients: ['4 egg yolks', '2 cups heavy cream', '1/2 cup sugar', '1 tsp vanilla'], steps: ['Heat the oven to 325.', 'Bake 40 minutes.'], source: 'Grandma Dorrance', owner: 'Madi' }), brulee);
  check('add: commit title with the name', put.message === 'Recipes: add Grandma’s crème brûlée (Madi)' && put.sha === 's0', put.message);
  check('add: the other recipes are untouched', JSON.stringify(JSON.parse(decoded(put)).recipes.slice(0, 11)) === JSON.stringify(JSON.parse(FILE).recipes));
  check('add: the new recipe opens, with "From Grandma Dorrance" as plain text', (await text('#vName')) === 'Grandma’s crème brûlée' && (await text('#vBody p.source')) === 'From Grandma Dorrance' && await page.isHidden('#editor'));
  check('add: the editor and the recipe are one step of history', (await depth()) === 1);
  check('add: a toast says it saved', (await text('#toast')).startsWith('Saved'));
  check('the sign-in is never in a URL, and the page never calls GitHub itself', urls.every(u => !u.includes(sess.token) && !u.includes('github.com/repos')));
  await page.goBack();
  await closed('view');
  check('add: a Dessert divider, and the card in the box', (await tabLabels()).join('|') === 'All 12|Crock pot 1|Dessert 1|Soup 1' && (await names()).includes('Grandma’s crème brûlée'));

  /* ---- edit ---- */
  // a field the page does not know, added on GitHub, is kept
  gh.text = gh.text.replace('"id": "salmon-bowls",', '"id": "salmon-bowls",\n      "rating": 5,');
  await openRecipe('Salmon bowls');
  check('signed in: the Edit button', await page.isVisible('#editBtn'));
  await tap('#editBtn');
  await opened('editor');
  check('Edit fills the form', (await page.inputValue('#fIngredients')) === 'Salmon\nRice\nMayo\nSriracha\nCucumbers' && (await text('#eTitle')) === 'Edit recipe' && await page.isVisible('#eDelete'));
  await page.fill('#fServings', '2');
  answer = false;
  await tap('#eCancel');
  check('Cancel with changes asks; No keeps the editor', asked.at(-1) === 'Discard the changes to this recipe?' && await page.isVisible('#editor.open'));
  answer = false;
  await page.goBack();
  await page.waitForTimeout(200);
  check('the back button asks too', asked.at(-1) === 'Discard the changes to this recipe?' && await page.isVisible('#editor.open') && (await depth()) === 2);
  await tap('#fCats [data-cat="Soup"]');
  gh.putQueue.push(409);
  const gets0 = gh.gets, puts0 = gh.puts.length;
  await tap('#eSave');
  await closed('editor');
  put = gh.puts.at(-1);
  const salmon = recipeIn(decoded(put), 'salmon-bowls');
  check('edit: after a 409 it reads again and saves on the second PUT', gh.gets - gets0 === 2 && gh.puts.length - puts0 === 2, { gets: gh.gets - gets0, puts: gh.puts.length - puts0 });
  check('edit: the change is saved, and the field the page does not know is kept', put.message === 'Recipes: edit Salmon bowls (Madi)' && salmon.servings === '2' && salmon.tags.join() === 'Soup' && salmon.rating === 5, salmon);
  check('409: the other change (Ketchup) is kept too', recipeIn(gh.text, 'burgers-and-fries').ingredients.includes('Ketchup'));
  check('edit: back on the recipe, which shows the change', (await page.$$eval('#vBody .chip', cs => cs.map(c => c.textContent).join('|'))) === 'Soup|Serves 2' && (await depth()) === 1);
  check('edit: the card is now tomato', (await page.$eval('#vBody .strip', s => getComputedStyle(s).backgroundColor)) === TOMATO);

  /* ---- errors keep the editor open ---- */
  await tap('#editBtn');
  await opened('editor');
  await page.fill('#fNotes', 'Use the good soy sauce.');
  const before = gh.text;
  api.env.GITHUB_TOKEN = 'github_pat_TEST_wrong';
  await tap('#eSave');
  await page.waitForSelector('#eError:not([hidden])');
  check('a bad GitHub token in the Worker: plain message, nothing saved', (await text('#eError')).includes('check its GitHub token. The change is not saved.') && !(await page.$('#eError [data-settings]')) && gh.text === before, await text('#eError'));
  api.env.GITHUB_TOKEN = 'github_pat_TEST_good';
  gh.offline = true;
  await tap('#eSave');
  await page.waitForFunction(() => document.getElementById('eError').textContent.startsWith('No connection.'));
  check('offline: "No connection. The change is not saved."', (await text('#eError')) === 'No connection. The change is not saved.');
  gh.offline = false;
  for (const k of [...api.kv.m.keys()]) if (k.startsWith('auth:session:')) api.kv.m.delete(k);   // the sign-in ends on the Worker
  await tap('#eSave');
  await page.waitForSelector('#eError [data-settings]');
  check('a sign-in that ended: says so, with Sign in again', (await text('#eError')).startsWith('You are signed out. Sign in again. The change is not saved.'));
  await tap('#eError [data-settings]');
  await opened('settings');
  check('Settings opens over the editor, with Back and no tab bar', (await text('#sBackText')) === 'Back' && await page.isHidden('#nav') && await page.isVisible('#sNeed'));
  await signIn('Madi', 'madi-password');
  await page.waitForSelector('#sMe:not([hidden])');
  check('signed in again, still with Back and no tab bar', await page.isVisible('#sBack') && await page.isHidden('#nav'));
  await tap('#sBack');
  await closed('settings');
  check('Back goes to the editor, which kept what was typed', (await page.inputValue('#fNotes')) === 'Use the good soy sauce.' && await page.isVisible('#editor.open'));
  await tap('#eSave');
  await closed('editor');
  check('and now it saves', recipeIn(gh.text, 'salmon-bowls').notes === 'Use the good soy sauce.');
  await page.goBack();
  await closed('view');

  /* ---- delete ---- */
  await openRecipe('Grandma’s crème brûlée');
  await tap('#editBtn');
  await opened('editor');
  const putsD = gh.puts.length;
  await tap('#eDelete');
  check('Delete asks for a second tap', (await text('#eDelete')) === 'Tap again to delete' && gh.puts.length === putsD);
  await tap('#eDelete');
  await closed('editor');
  await closed('view');
  check('delete: gone from the file and the box, back on the box', !recipeIn(gh.text, 'grandmas-creme-brulee') && !(await names()).includes('Grandma’s crème brûlée') && (await depth()) === 0);
  check('delete: the Dessert divider is gone with it', !(await page.$('#tabs [data-tab="Dessert"]')));
  check('delete: a toast says so', (await text('#toast')) === 'Deleted Grandma’s crème brûlée.');

  /* ---- the admin ---- */
  await tap('#nav [data-go="settings"]');
  await opened('settings');
  await tap('#aOut');
  await page.waitForSelector('#aBox:not([hidden])');
  check('Sign out forgets the sign-in on the phone and on the Worker', (await page.evaluate(() => localStorage.getItem('dorrance-session'))) === null && sessions() === 0);
  check('signed out: the tab bar goes, Back to the box comes', await page.isHidden('#nav') && await page.isVisible('#sBack'));
  const meCalls = () => urls.filter(u => u.endsWith('/api/auth/me')).length;
  await signIn(api.ADMIN, api.ADMIN_PASSWORD);
  await page.waitForSelector('#sWaitList [data-approve]');
  check('the admin: the You card says Admin', (await text('#sMeRole')) === 'Admin · signed in');
  const waitingNames = await page.$$eval('#sWaitList .who b', bs => bs.map(b => b.textContent));
  check('Waiting for you: Jen and Megan, each with Approve and Deny', waitingNames.join() === 'Jen,Megan' && (await page.$$('#sWaitList [data-approve]')).length === 2);
  check('Accounts: Madi, with Remove', (await page.$$eval('#sPeople .who b', bs => bs.map(b => b.textContent))).join() === 'Madi');
  check('a dot on Settings while accounts wait', await page.$eval('#navSettings', b => b.classList.contains('dot')));
  await phoneRules('settings, the admin');
  await tap('#sWaitList [data-approve="jen"]');
  await page.waitForFunction(() => document.getElementById('sSay').textContent.includes('Jen'));
  check('Approve: Jen can sign in', (await text('#sSay')) === 'Jen can sign in now.' && (await user('jen')).status === 'approved');
  await tap('#sWaitList [data-remove="megan"]');
  check('Deny asks for a second tap', (await text('#sWaitList [data-remove="megan"]')) === 'Tap again to deny' && !!(await user('megan')));
  await tap('#sWaitList [data-remove="megan"]');
  await page.waitForFunction(() => document.getElementById('sSay').textContent.includes('Megan'));
  check('Deny removes the request; no one waits, so no dot', (await text('#sSay')) === 'Megan’s request is gone.' && !(await user('megan')) && await page.isHidden('#sWaiting') && !(await page.$eval('#navSettings', b => b.classList.contains('dot'))));
  await tap('#sPeople [data-remove="madi"]');
  await tap('#sPeople [data-remove="madi"]');
  await page.waitForFunction(() => document.getElementById('sSay').textContent.includes('Madi'));
  check('Remove takes an account away', (await text('#sSay')) === 'Madi can no longer sign in.' && !(await user('madi')) && (await page.$$eval('#sPeople .who b', bs => bs.map(b => b.textContent))).join() === 'Jen');
  const me0 = meCalls();
  await page.reload();
  await page.waitForSelector('#deck .rc');
  await page.waitForTimeout(300);
  check('a page load does not count the waiting accounts again within 6 hours (a KV list)', meCalls() === me0);
  await page.evaluate(() => localStorage.removeItem('recipes-waiting'));
  await page.reload();
  await page.waitForSelector('#deck .rc');
  await page.waitForFunction(n => performance.getEntriesByType('resource').some(e => e.name.endsWith('/api/auth/me')), me0);
  check('without a recent count, a page load asks once', meCalls() === me0 + 1);

  /* ---- the meal plan and the grocery list: everyone has one, and Mitchell shares theirs with Nicole ---- */
  // From here every page says it is Saturday, October 24, 2026: Date.now() stands still and the timers run.
  const DAY0 = new Date(2026, 9, 24, 18, 0);
  const INK = 'rgb(42, 29, 23)';
  await api.addUser('Nicole', 'nicole-password');
  // Mitchell's plan in KV: the one they share, or their own
  const mealsKV = async () => {
    const me = await api.kv.get('meals:me:mitchell', 'json');
    return api.kv.get('meals:plan:' + (me && me.plan ? me.plan : 'solo.mitchell.admin'), 'json');
  };
  const writes = () => api.kv.puts.filter(k => k.startsWith('meals:plan:')).length;
  const queued = (p = page) => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('recipes-meals')).queue.length; } catch (e) { return -1; } });
  const sent = (p = page) => p.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('recipes-meals')).queue.length === 0; } catch (e) { return false; } });
  const navTabs = (p = page) => p.$$eval('#nav button:not([hidden])', bs => bs.map(b => b.textContent.trim() + (b.getAttribute('aria-current') ? '*' : '')).join());
  const shareText = (p = page) => p.$eval('#sShare', s => s.innerText.replace(/\s+/g, ' ').trim());
  const askChips = (p = page) => p.$$eval('#sShare [data-ask]', bs => bs.map(b => b.textContent).join());
  const hasDot = p => p.$eval('#navSettings', b => b.classList.contains('dot'));
  // Settings again, so it reads who shares
  const reopen = async (p = page) => { await p.tap('#nav [data-go="box"]'); await closed('settings', p); await p.tap('#navSettings'); await opened('settings', p); };
  const days = (p = page) => p.$$eval('#pDays li', ls => ls.map(l => {
    const w = l.querySelector('.what'), b = l.querySelector('.by');
    return `${l.querySelector('.dw').textContent} ${l.querySelector('.dn').textContent}: ${w ? w.textContent : '+'}${b ? ' (' + b.getAttribute('aria-label').slice(11) + ')' : ''}`;
  }).join(' | '));
  const items = (sel, p = page) => p.$$eval(`${sel} li`, ls => ls.map(l => l.querySelector('.nm').textContent + (l.querySelector('small') ? ' — ' + l.querySelector('small').textContent : '')));
  const onList = () => page.$$eval('#gChips .gchip > span', s => s.map(x => x.textContent).join());
  const bar = (p = page) => p.$eval('meta[name="theme-color"]', m => m.content);
  const poke = p => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // back on the page
  const posts = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/meals')) posts.push(r.url()); });
  // Another phone, signed in as `name`
  async function phoneOf(name, password) {
    const c = await newContext();
    const s = await (await api.call('http://x/api/auth/login', { method: 'POST', body: JSON.stringify({ name, password }) })).json();
    await c.addInitScript(s => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('dorrance-session', JSON.stringify({ token: s.token, name: s.name, admin: s.admin }));
    }, s);
    const p = await c.newPage();
    watch(p);
    await p.clock.setFixedTime(DAY0);
    await p.goto(base);
    await p.waitForSelector('#deck .rc');
    await p.waitForLoadState('networkidle');
    return { c, p };
  }

  await page.clock.setFixedTime(DAY0);
  const mealGets0 = urls.filter(u => u.endsWith('/api/meals')).length, kvPuts0 = api.kv.puts.length;
  await page.reload();
  await page.waitForSelector('#navPlan:not([hidden])');
  await page.waitForLoadState('networkidle');
  check('the admin plans dinners: four tabs, Recipes picked', (await navTabs()) === 'Recipes*,Meal plan,Grocery list,Settings' && (await page.$eval('#nav', n => getComputedStyle(n).gridTemplateColumns.split(' ').length)) === 4);
  check('a page load reads the meal plan once and writes nothing to KV', urls.filter(u => u.endsWith('/api/meals')).length - mealGets0 === 1 && api.kv.puts.length === kvPuts0);

  // Settings: share the plan. Mitchell asks Jen, who says no, then Nicole, who says yes.
  await tap('#navSettings');
  await opened('settings');
  await page.waitForSelector('#sShare [data-ask="nicole"]');
  check('Settings: "Meal plan and grocery list" after Accounts, with a chip to ask each account', (await askChips()) === 'Jen,Nicole'
    && await page.evaluate(() => { const g = [...document.querySelectorAll('#settings .group > h2')].map(h => h.textContent); return g.indexOf('Meal plan and grocery list') === g.indexOf('Accounts') + 1; }));
  await tap('#sShare [data-ask="jen"]');
  await page.waitForSelector('#sShare [data-share="cancel"]');
  check('asking Jen: Waiting for Jen to say yes, with Cancel', (await shareText()).includes('Waiting for Jen to say yes') && (await text('#sSay')) === 'Jen is asked. They can say yes in their Settings.');
  await phoneRules('settings, an ask on its way');

  const jen = await phoneOf('Jen', 'jen-password'), jp = jen.p;
  check('Jen has a plan too: four tabs, and a dot on Settings for the ask', (await navTabs(jp)) === 'Recipes*,Meal plan,Grocery list,Settings'
    && await hasDot(jp) && (await jp.getAttribute('#navSettings', 'aria-label')) === 'Settings, Mitchell asked to share a meal plan');
  await jp.tap('#nav [data-go="plan"]');
  await opened('plan', jp);
  check('Jen’s own plan: Dinners for Jen, nothing planned', (await jp.textContent('#pWho')) === 'Dinners for Jen' && !(await days(jp)).includes('('));
  await jp.tap('#nav [data-go="settings"]');
  await opened('settings', jp);
  await jp.waitForSelector('#sShare [data-share="join"]');
  check('Jen’s Settings: Mitchell asked to share, with Join and No thanks', (await shareText(jp)).startsWith('M Mitchell asked to share One meal plan'), await shareText(jp));
  await phoneRules('settings, asked to share', jp);
  await jp.tap('#sShare [data-share="decline"]');
  await jp.waitForSelector('#sShare [data-share="join"]', { state: 'detached' });
  check('No thanks: the ask and the dot go', (await jp.textContent('#sSay')) === 'You said no to Mitchell.' && !(await hasDot(jp)), { say: await jp.textContent('#sSay'), dot: await hasDot(jp) });
  await jen.c.close();
  await reopen();
  await page.waitForSelector('#sShare [data-ask="nicole"]');
  check('Mitchell sees the no: free to ask someone else', !(await page.$('#sShare [data-share="cancel"]')));

  await tap('#sShare [data-ask="nicole"]');
  await page.waitForSelector('#sShare [data-share="cancel"]');
  const nicole = await phoneOf('Nicole', 'nicole-password'), np = nicole.p;
  await np.tap('#navSettings');
  await opened('settings', np);
  await np.waitForSelector('#sShare [data-share="join"]');
  await np.tap('#sShare [data-share="join"]');
  await np.waitForSelector('#sShare [data-share="leave"]');
  check('Nicole says yes: they share with Mitchell now', (await np.textContent('#sSay')) === 'You share a meal plan and grocery list with Mitchell now.'
    && (await shareText(np)).includes('Mitchell Shares your meal plan and grocery list') && !(await hasDot(np)));
  await reopen();
  await page.waitForSelector('#sShare [data-share="leave"]');
  check('Mitchell sees it: shares with Nicole, with Stop sharing', (await shareText()).includes('Nicole Shares your meal plan and grocery list Stop sharing'));
  await phoneRules('settings, sharing');

  // The meal plan
  await tap('#nav [data-go="plan"]');
  await opened('plan');
  await closed('settings');
  check('Meal plan takes the place of Settings, at the same depth', (await depth()) === 1 && (await navTabs()) === 'Recipes,Meal plan*,Grocery list,Settings');
  check('the header: Dinners for Mitchell and Nicole, two faces, This week picked',
    (await text('#pWho')) === 'Dinners for Mitchell and Nicole' && (await page.$$('#pFaces .av')).length === 2 && (await pressed('#pWeeks button')).join() === 'This weekOct 19–25');
  check('Monday to Sunday, all empty, and Saturday the 24th is today',
    (await days()) === 'Mon 19: + | Tue 20: + | Wed 21: + | Thu 22: + | Fri 23: + | Sat 24: + | Sun 25: +'
    && await page.$eval('#pDays li[data-date="2026-10-24"] .date', d => d.classList.contains('today')) && await page.isHidden('#pShop'));
  check('the browser bar takes the carrot header', (await bar()) === CARROT);
  await phoneRules('meal plan');
  await tap('#pDays [data-plan="2026-10-24"]');
  await opened('pick');
  check('Plan dinner opens the picker for that day, over the plan', (await text('#pkTitle')) === 'Dinner on Saturday, Oct 24' && (await depth()) === 2 && (await bar()) === CARROT);
  await phoneRules('dinner picker');
  await page.fill('#pkQ', 'zup');
  check('the search in the picker finds the zuppa', (await page.$$eval('#pkList button', bs => bs.map(b => b.textContent).join())) === ZUPPA);
  await tap('#pkList button');
  await closed('pick');
  check('picked: Saturday has the zuppa in tomato, planned by Mitchell, with the focus on it',
    (await days()).includes(`Sat 24: ${ZUPPA} (Mitchell)`) && (await bg('#pDays li[data-date="2026-10-24"] .dinner')) === TOMATO
    && await page.evaluate(() => document.activeElement.closest('li')?.dataset.date === '2026-10-24'));
  await tap('#pDays [data-plan="2026-10-25"]');
  await opened('pick');
  await page.fill('#pkNote', 'Leftovers');
  await tap('#pkForm .pill');
  await closed('pick');
  check('a note: Sunday is Leftovers', (await days()).includes('Sun 25: Leftovers (Mitchell)'));
  await sent();
  let d = await mealsKV();
  check('the Worker keeps both, with who planned them', d.days['2026-10-24'].recipe === 'megans-zuppa-toscana' && d.days['2026-10-24'].by === 'Mitchell' && d.days['2026-10-25'].note === 'Leftovers');
  await page.focus('#pDays [data-clear="2026-10-25"]');   // with a keyboard: a tap does not focus a button in Safari
  await page.keyboard.press('Enter');
  check('x clears Sunday, and the focus goes to its Plan dinner', (await days()).endsWith('Sun 25: +') && await page.evaluate(() => document.activeElement.dataset.plan === '2026-10-25'));
  await sent();

  // Nicole plans next week, and each sees the other's dinner
  await np.tap('#nav [data-go="plan"]');
  await opened('plan', np);
  await poke(np);
  await np.waitForFunction(z => document.querySelector('#pDays li[data-date="2026-10-24"] .what')?.textContent === z, ZUPPA);
  check('Nicole sees the zuppa, planned by Mitchell, and Sunday cleared', (await days(np)).includes(`Sat 24: ${ZUPPA} (Mitchell)`) && (await days(np)).endsWith('Sun 25: +'));
  await np.tap('#pWeeks [data-week="1"]');
  check('Next week: Oct 26 to Nov 1', (await days(np)).startsWith('Mon 26: +') && (await days(np)).endsWith('Sun 1: +') && (await np.$eval('#pWeeks [aria-pressed="true"]', b => b.textContent)) === 'Next weekOct 26–Nov 1');
  await np.tap('#pDays [data-plan="2026-10-26"]');
  await opened('pick', np);
  await np.tap('#pkList button:has-text("Pepperoncini roast")');
  await closed('pick', np);
  await sent(np);
  d = await mealsKV();
  check('the roast, planned by Nicole, is kept with Mitchell’s dinner', d.days['2026-10-26'].by === 'Nicole' && d.days['2026-10-24'].by === 'Mitchell');
  await poke(page);
  await tap('#pWeeks [data-week="1"]');
  await page.waitForFunction(() => !!document.querySelector('#pDays li[data-date="2026-10-26"] .what'));
  check('Mitchell sees the roast, planned by Nicole', (await days()).includes('Mon 26: Pepperoncini roast (Nicole)'));

  // The recipe card: Add to grocery list
  await tap('#pWeeks [data-week="0"]');
  await tap('#pDays [data-open="megans-zuppa-toscana"]');
  await opened('view');
  check('a dinner opens its recipe, with ‹ Meal plan to go back', (await text('#vName')) === ZUPPA && (await text('#vBackText')) === 'Meal plan');
  check('the recipe has Add to grocery list in butter, under Start cooking',
    (await text('#listBtn')) === 'Add to grocery list' && (await page.getAttribute('#listBtn', 'aria-pressed')) === 'false' && (await bg('#listBtn')) === BUTTER
    && await page.$eval('#listBtn', b => b.previousElementSibling?.id === 'cookBtn'));
  await tap('#listBtn');
  check('tapped: On the grocery list', (await text('#listBtn')) === 'On the grocery list' && (await page.getAttribute('#listBtn', 'aria-pressed')) === 'true');
  await tap('#view [data-close]');
  await closed('view');
  check('back on the plan: the zuppa is on the list, so the button opens the list', (await text('#pShopText')) === 'Open the grocery list');
  await tap('#pWeeks [data-week="1"]');
  check('next week: Put 1 dinner on the grocery list (the roast)', (await text('#pShopText')) === 'Put 1 dinner on the grocery list');
  await tap('#pShop');
  await opened('grocery');
  await closed('plan');
  check('it opens the grocery list tab in place of the plan', (await depth()) === 1 && (await navTabs()) === 'Recipes,Meal plan,Grocery list*,Settings' && (await bar()) === BUTTER);
  check('the list has both recipes as chips', (await onList()) === `${ZUPPA},Pepperoncini roast` && (await text('#gSum')).startsWith('2 recipes · '));
  check('an item shows its amount and its recipe', (await items('#gGetList')).includes(`Chicken broth — 2 cups · For ${ZUPPA}`), await items('#gGetList'));

  // Two recipes with the same item
  await tap('#gAddRec');
  await closed('grocery');
  check('Add a recipe goes to the recipe box', (await depth()) === 0);
  for (const name of ['Burgers and fries', 'Pulled pork sandwiches', 'Sheet pan breakfast burritos']) {
    await openRecipe(name);
    await tap('#listBtn');
    await page.goBack();
    await closed('view');
  }
  await openRecipe("Jen's tortellini pasta salad");
  check('a recipe with no ingredients has no Add to grocery list', !(await page.$('#listBtn')));
  await page.goBack();
  await closed('view');
  await tap('#nav [data-go="grocery"]');
  await opened('grocery');
  let get = await items('#gGetList');
  check('Buns from two recipes is one line, for both', get.filter(l => l.startsWith('Buns')).length === 1 && get.includes('Buns — For Burgers and fries, Pulled pork sandwiches'), get);
  check('bacon from the zuppa and the burritos is one line, with the amount', get.includes(`Bacon (thick-cut) — 5 strips · For ${ZUPPA}, Sheet pan breakfast burritos`), get);
  check('the summary counts the recipes and the items to get', (await text('#gSum')) === `5 recipes · ${get.length} to get`);
  await page.fill('#gExtra', '2 lb apples');
  await page.press('#gExtra', 'Enter');
  check('Add something else: Apples, 2 lb, Extra; the field empties', (await items('#gGetList')).includes('Apples — 2 lb · Extra') && (await page.inputValue('#gExtra')) === '');
  await phoneRules('grocery list');
  await sent();

  // Got it, in a batch, and Clear. Burgers and fries has Ketchup too, from the 409 above.
  const posts0 = posts.length, w0 = writes();
  for (const k of ['burgers', 'buns', 'fries', 'ketchup']) await tap(`#gGetList [data-key="${k}"]`);
  check('ticked items move to Got it, struck through', (await items('#gGotList')).join() === 'Burgers,Buns,Fries,Ketchup'
    && await page.$eval('#gGotList .nm', n => getComputedStyle(n).textDecorationLine === 'line-through') && await page.isVisible('#gClear'));
  await sent();
  check('four quick ticks go in at most two POSTs, one KV write each', posts.length - posts0 <= 2 && writes() - w0 === posts.length - posts0, { posts: posts.length - posts0, writes: writes() - w0 });
  await tap('#gClear');
  await sent();
  d = await mealsKV();
  const cleared = { gotHidden: await page.isHidden('#gGot'), chips: await onList(), kept: d.list.recipes.map(r => r.id), gone: d.list.gone, get: await items('#gGetList') };
  check('Clear: Got it empties; Burgers and fries has nothing left, so its chip goes; the pulled pork keeps its own item',
    cleared.gotHidden && !cleared.chips.includes('Burgers and fries') && !cleared.kept.includes('burgers-and-fries')
    && cleared.gone.includes('buns') && cleared.get.some(l => l.startsWith('Pulled pork')) && !cleared.get.some(l => l.startsWith('Buns')), cleared);
  await page.focus('#gChips [data-drop="pulled-pork-sandwiches"]');
  await page.keyboard.press('Enter');
  check('x takes Pulled pork sandwiches off the list, and the focus goes on', !(await onList()).includes('Pulled pork') && !(await items('#gGetList')).some(l => l.startsWith('Pulled pork'))
    && await page.evaluate(() => document.activeElement.id === 'gAddRec'));
  await sent();
  await np.tap('#nav [data-go="grocery"]');
  await opened('grocery', np);
  await poke(np);
  await np.waitForFunction(() => document.querySelectorAll('#gChips .gchip').length === 3);
  check('Nicole sees the same list', (await items('#gGetList', np)).join() === (await items('#gGetList')).join());

  // No connection, then a busy Worker
  gh.offline = true;
  await tap('#gGetList [data-key="apples"]');
  await page.waitForSelector('#gNote:not([hidden])');
  check('no connection: the tick shows, and a note says the change waits on this phone',
    (await text('#gNote')) === 'No connection. Your changes are kept on this phone and sent later.' && (await items('#gGotList')).includes('Apples') && (await queued()) === 1);
  gh.offline = false;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await sent();
  check('back online: it is sent, and the note goes', await page.isHidden('#gNote') && (await mealsKV()).list.got.includes('apples'));
  api.kv.kvFail.push('KV PUT failed: 429 Too Many Requests');
  const posts1 = posts.length;
  await tap('#gGotList [data-key="apples"]');
  await sent();
  check('busy (the other phone saved that second): it sends again by itself, with no note', posts.length - posts1 === 2 && !(await mealsKV()).list.got.includes('apples') && await page.isHidden('#gNote'));

  // Night: the headers keep their colors, with ink text
  await page.evaluate(() => { localStorage.setItem('theme', 'dark'); dispatchEvent(new StorageEvent('storage', { key: 'theme' })); });
  check('Night: the grocery header stays butter, with ink text, on the night ground',
    (await bg('#grocery .grohead')) === BUTTER && (await page.$eval('#gTitle', h => getComputedStyle(h).color)) === INK && (await bg('#grocery')) === 'rgb(28, 21, 18)');
  await tap('#nav [data-go="plan"]');
  await opened('plan');
  check('Night: the plan header stays carrot, with ink text', (await bg('#plan .planhead')) === CARROT && (await page.$eval('#pTitle', h => getComputedStyle(h).color)) === INK);
  await page.evaluate(() => { localStorage.setItem('theme', 'auto'); dispatchEvent(new StorageEvent('storage', { key: 'theme' })); });
  await page.goBack();
  await closed('plan');
  check('the back button goes from a tab to the box', (await depth()) === 0 && (await navTabs()) === 'Recipes*,Meal plan,Grocery list,Settings');

  // Stop sharing, then the account of the one Mitchell shares with removed
  await tap('#navSettings');
  await opened('settings');
  await page.waitForSelector('#sShare [data-share="leave"]');
  await tap('#sShare [data-share="leave"]');
  check('Stop sharing asks for a second tap', (await text('#sShare [data-share="leave"]')) === 'Tap again' && !!(await api.kv.get('meals:me:mitchell', 'json')).plan);
  await tap('#sShare [data-share="leave"]');
  await page.waitForFunction(() => document.getElementById('sSay').textContent.startsWith('You stopped'));
  await page.waitForSelector('#sShare [data-ask="nicole"]');   // the chips come back once the accounts are read again
  check('stopped: Mitchell has their own plan back, with nothing planned', (await text('#sSay')) === 'You stopped sharing with Nicole. Your own plan is back.'
    && (await text('#pWho')) === 'Dinners for Mitchell' && !(await days()).includes('(') && (await askChips()) === 'Jen,Nicole',
    { say: await text('#sSay'), who: await text('#pWho'), days: await days(), chips: await askChips() });
  await poke(np);
  await np.waitForFunction(() => document.getElementById('pWho').textContent === 'Dinners for Nicole');
  check('Nicole keeps the shared plan, the roast and all', (await days(np)).includes('Mon 26: Pepperoncini roast (Nicole)'));
  await tap('#sShare [data-ask="nicole"]');
  await page.waitForSelector('#sShare [data-share="cancel"]');
  await np.tap('#nav [data-go="settings"]');
  await opened('settings', np);
  await np.waitForSelector('#sShare [data-share="join"]');
  await np.tap('#sShare [data-share="join"]');
  await np.waitForSelector('#sShare [data-share="leave"]');
  await nicole.c.close();
  await reopen();
  await page.waitForSelector('#sShare [data-share="leave"]');
  await tap('#sPeople [data-remove="nicole"]');
  await tap('#sPeople [data-remove="nicole"]');
  await page.waitForSelector('#sShare [data-ask]');
  await page.waitForFunction(() => document.querySelectorAll('#sShare [data-ask]').length === 1);
  check('removing the account of the one Mitchell shares with: Mitchell plans alone, and that chip goes',
    (await askChips()) === 'Jen' && (await text('#pWho')) === 'Dinners for Mitchell');

  // A sign-in that ended, and Sign out: the tabs and the kept plan go
  await tap('#nav [data-go="grocery"]');
  await opened('grocery');
  for (const k of [...api.kv.m.keys()]) if (k.startsWith('auth:session:')) api.kv.m.delete(k);
  await page.fill('#gExtra', 'Milk');
  await page.press('#gExtra', 'Enter');
  await page.waitForFunction(() => !localStorage.getItem('dorrance-session'));
  await closed('grocery');
  check('a sign-in that ended: signed out, back on the box, the tabs and the kept plan gone',
    (await page.evaluate(() => localStorage.getItem('recipes-meals'))) === null && await page.isHidden('#nav') && (await depth()) === 0);
  await tap('#signInBtn');
  await opened('settings');
  await signIn(api.ADMIN, api.ADMIN_PASSWORD);
  await page.waitForSelector('#navPlan:not([hidden])');
  check('signed in again: the tabs come back from the Worker', (await navTabs()) === 'Recipes,Meal plan,Grocery list,Settings*');
  await tap('#aOut');
  await page.waitForSelector('#aBox:not([hidden])');
  check('Sign out: the kept plan goes too', (await page.evaluate(() => localStorage.getItem('recipes-meals'))) === null && await page.isHidden('#nav'));

  /* ---- everyone's book: owners, Shared with you, a copy, the switch, and a household ---- */
  // Hayden owns the zuppa, the roast and the burgers (not shared); Ellie owns the salmon; the rest are from before owners.
  const owned = JSON.parse(FILE);
  const own = (id, owner, shared) => Object.assign(owned.recipes.find(r => r.id === id), { owner }, shared === false ? { shared } : {});
  own('megans-zuppa-toscana', 'Hayden');
  own('burgers-and-fries', 'Hayden', false);
  own('pepperoncini-roast', 'Hayden');
  own('salmon-bowls', 'Ellie');
  gh.text = site.text = D.serialize(owned);
  const fileNow = () => JSON.parse(gh.text);
  const sharedNames = p => p.$$eval('#otherList .nm', ns => ns.map(n => n.textContent).join());
  const inDeck = (p, name) => p.waitForFunction(n => [...document.querySelectorAll('#deck .rc .nm')].some(x => x.textContent === n), name);
  await page.reload();
  await page.waitForSelector('#deck .rc');
  check('signed out: only shared recipes, and no Shared with you', !(await names()).includes('Burgers and fries') && (await names()).includes(ZUPPA) && await page.isHidden('#others'));

  await api.addUser('Hayden', 'hayden-password');
  await api.addUser('Ellie', 'ellie-password');
  const ellie = await phoneOf('Ellie', 'ellie-password'), ep = ellie.p;
  check('Ellie’s book: Ellie’s salmon and the recipes from before owners; Hayden’s shared ones are Shared with you, the burgers not',
    (await names(ep)).includes('Salmon bowls') && (await names(ep)).includes('Tacos and beans') && !(await names(ep)).includes(ZUPPA)
    && (await sharedNames(ep)) === `${ZUPPA},Pepperoncini roast`, { book: await names(ep), shared: await sharedNames(ep) });
  await phoneRules('the box with Shared with you', ep);
  await ep.tap('#otherList [data-pull="pepperoncini-roast"]');
  await inDeck(ep, 'Pepperoncini roast');
  check('Add: the roast is in Ellie’s book, kept in recipes.json', fileNow().books.ellie.join() === 'pepperoncini-roast'
    && gh.puts.at(-1).message === 'Recipes: add Pepperoncini roast to a book (Ellie)' && !(await sharedNames(ep)).includes('Pepperoncini'));
  const later = fileNow();
  later.recipes.find(r => r.id === 'pepperoncini-roast').notes = 'Hayden’s tip: a splash of the jar juice.';
  gh.text = D.serialize(later);   // Hayden changes it, from another phone or a Claude chat
  await ep.reload();
  await inDeck(ep, 'Pepperoncini roast');
  await openRecipe('Pepperoncini roast', ep);
  check('the roast follows Hayden’s changes, says whose it is, and offers Remove and a copy',
    (await ep.textContent('#vBody .notes p')) === 'Hayden’s tip: a splash of the jar juice.' && (await ep.$$eval('#vBody .chip', cs => cs.map(c => c.textContent))).includes('Hayden’s recipe')
    && (await ep.textContent('#vBody .bookbtn')) === 'Remove from my book' && (await ep.getAttribute('#editBtn', 'aria-label')) === 'Make your own copy');
  await ep.tap('#editBtn');
  await opened('editor', ep);
  check('Edit on Hayden’s recipe: Your copy, named for Ellie, shared, no Delete',
    (await ep.textContent('#eTitle')) === 'Your copy' && (await ep.inputValue('#fName')) === "Pepperoncini roast (Ellie's version)" && (await ep.getAttribute('#fShare', 'aria-checked')) === 'true' && await ep.isHidden('#eDelete'));
  await phoneRules('the editor with the share switch', ep);
  await ep.tap('#eSave');
  await closed('editor', ep);
  const copy = fileNow().recipes.find(r => r.id === 'pepperoncini-roast-ellies-version');
  check('the copy is Ellie’s, in the place of the roast, which stays Hayden’s', !!copy && copy.owner === 'Ellie' && !fileNow().books
    && fileNow().recipes.find(r => r.id === 'pepperoncini-roast').owner === 'Hayden' && (await ep.textContent('#vName')) === "Pepperoncini roast (Ellie's version)");
  await ep.goBack();
  await closed('view', ep);
  check('the box: the copy in the book, the roast Shared with you again', (await names(ep)).includes("Pepperoncini roast (Ellie's version)") && (await sharedNames(ep)).includes('Pepperoncini roast'));
  await ep.tap(`#otherList [data-pull="megans-zuppa-toscana"]`);
  await inDeck(ep, ZUPPA);
  await openRecipe(ZUPPA, ep);
  await ep.tap('#vBody [data-unpull]');
  await ep.waitForSelector('#vBody [data-pull]');
  check('Remove from my book: the zuppa is Shared with you again', !fileNow().books && !(await names(ep)).includes(ZUPPA) && (await sharedNames(ep)).includes(ZUPPA));
  await ep.goBack();
  await closed('view', ep);

  await openRecipe('Salmon bowls', ep);
  await ep.tap('#editBtn');
  await opened('editor', ep);
  check('Ellie’s own recipe: Edit recipe, shared', (await ep.textContent('#eTitle')) === 'Edit recipe' && (await ep.getAttribute('#fShare', 'aria-checked')) === 'true');
  await ep.tap('#fShare');
  check('the switch: off, and it says who sees the recipe', (await ep.getAttribute('#fShare', 'aria-checked')) === 'false' && (await ep.textContent('#fShareHint')) === 'Only you and the person you share a meal plan with see it.');
  await ep.tap('#eSave');
  await closed('editor', ep);
  check('not shared: saved as "shared": false, with a Not shared chip', fileNow().recipes.find(r => r.id === 'salmon-bowls').shared === false
    && (await ep.$$eval('#vBody .chip', cs => cs.map(c => c.textContent))).includes('Not shared'));
  await ep.goBack();
  await closed('view', ep);

  const hayden = await phoneOf('Hayden', 'hayden-password'), hp = hayden.p;
  check('Hayden: the burgers are in Hayden’s book; Ellie’s copy is shared with Hayden, the salmon not',
    (await names(hp)).includes('Burgers and fries') && (await sharedNames(hp)) === "Pepperoncini roast (Ellie's version)", { book: await names(hp), shared: await sharedNames(hp) });
  // Hayden and Ellie share a meal plan: a household, and one book
  const tokenOf = p => p.evaluate(() => JSON.parse(localStorage.getItem('dorrance-session')).token);
  const share = async (p, body) => api.call('http://x/api/meals/share', { method: 'POST', headers: { authorization: 'Bearer ' + await tokenOf(p) }, body: JSON.stringify(body) });
  await share(hp, { do: 'ask', key: 'ellie' });
  await share(ep, { do: 'join' });
  await ep.reload();
  await inDeck(ep, 'Burgers and fries');
  check('a household: Ellie’s book has all of Hayden’s recipes, the burgers too, and nothing is left to share with Ellie',
    (await names(ep)).includes(ZUPPA) && (await names(ep)).includes('Pepperoncini roast') && await ep.isHidden('#others'));
  await openRecipe('Burgers and fries', ep);
  check('Ellie edits Hayden’s recipes now, with no copy', (await ep.getAttribute('#editBtn', 'aria-label')) === 'Edit recipe' && !(await ep.$('#vBody .bookbtn')));
  await hayden.c.close();
  await ellie.c.close();

  // Offline and an update, with the service worker on. No stand-ins, so the page reads the site's own files.
  {
    const c = await browser.newContext(phone), p = await c.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(base);
    await p.waitForSelector('#deck .rc');
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload();
    await p.waitForSelector('#deck .rc');
    check('offline: the service worker is in charge after a reload', await p.evaluate(() => (navigator.serviceWorker.controller?.scriptURL || '').endsWith('/recipes/sw.js')));
    await p.waitForTimeout(500);
    check('offline: no update notice on the first install', !(await p.$('#toast.tap')));
    await c.setOffline(true);
    await p.reload();
    const off = await p.waitForSelector('#deck .rc', { timeout: 5000 }).then(() => true, () => false);
    check('offline: opens with the network off, and says it shows the copy on the phone', off && (await p.textContent('#notice')).startsWith('No connection'), off && await p.textContent('#notice'));
    await c.setOffline(false);
    swBump = 'recipes-v999';
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    const shown = await p.waitForSelector('#toast.tap.on', { timeout: 8000 }).then(() => true, () => false);
    check('an update shows "Updated · Tap to reload"', shown && (await p.textContent('#toast')) === 'Updated · Tap to reload');
    if (shown) {
      await Promise.all([p.waitForEvent('load'), p.tap('#toast')]);
      await p.waitForSelector('#deck .rc');
      const keys = await p.evaluate(() => caches.keys());
      check('tapping it reloads, on the new cache only', keys.includes('recipes-v999') && !keys.some(k => k.startsWith('recipes-') && k !== 'recipes-v999'), keys);
    }
    check('offline: no page errors', errs.length === 0, errs);
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
