// Run: node --test recipes/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../data.js');

const FILE = fs.readFileSync(path.join(__dirname, '..', 'recipes.json'), 'utf8');
// The frozen copy of the book that the browser checks use, so the family's edits do not change what these expect
const FIXED = fs.readFileSync(path.join(__dirname, 'fixture-recipes.json'), 'utf8');
const form = o => ({ name: '', servings: '', tags: '', ingredients: '', steps: '', notes: '', source: '', ...o });

test('recipes.json is valid and in the written format', () => {
  const data = D.parse(FILE);
  assert.equal(D.serialize(data), FILE, 'the file round-trips byte for byte: 2 spaces and a newline at the end');
  const ids = new Set();
  for (const r of data.recipes) {
    assert.ok(r.id && r.name && Array.isArray(r.ingredients), r.id);
    assert.ok(!ids.has(r.id), 'duplicate id ' + r.id);
    ids.add(r.id);
  }
});

test('ids come from the name', () => {
  assert.equal(D.slug("Megan's zuppa toscana"), 'megans-zuppa-toscana');
  assert.equal(D.slug('Madi’s pasta salad'), 'madis-pasta-salad');
  assert.equal(D.slug('Crème brûlée'), 'creme-brulee');
  assert.equal(D.slug('  Mac & cheese (baked!) '), 'mac-cheese-baked');
  assert.equal(D.slug('🍕'), 'recipe');
  const list = [{ id: 'tacos' }, { id: 'tacos-2' }];
  assert.equal(D.uniqueId('Tacos', list), 'tacos-3');
  assert.equal(D.uniqueId('Nachos', list), 'nachos');
});

test('pasted lists lose their marks', () => {
  assert.equal(D.cleanPaste('- 1 cup rice\n• 2 eggs\r\n* salt\n\n1. Boil water\n2) Add rice\n10. Serve\n▢ 1 lb beef'),
    '1 cup rice\n2 eggs\nsalt\nBoil water\nAdd rice\nServe\n1 lb beef');
  assert.equal(D.cleanLine('1.5 lb flour'), '1.5 lb flour');
  assert.equal(D.cleanLine('2 eggs'), '2 eggs');
  assert.equal(D.cleanLine('1.'), '');
});

test('the form makes a recipe in file order and leaves out empty fields', () => {
  const r = D.fromForm(form({ name: ' Toast ', ingredients: 'Bread\n\n Butter \n' }), 'toast');
  assert.deepEqual(r, { id: 'toast', name: 'Toast', ingredients: ['Bread', 'Butter'] });
  assert.deepEqual(Object.keys(r), ['id', 'name', 'ingredients']);
  const full = D.fromForm(form({ name: 'Soup', servings: '4', tags: 'Soup, soup, Quick,', ingredients: 'Water', steps: 'Boil\nServe', notes: 'Hot.', source: 'example.com/soup' }), 'soup');
  assert.deepEqual(Object.keys(full), ['id', 'name', 'servings', 'tags', 'ingredients', 'steps', 'notes', 'source']);
  assert.deepEqual(full.tags, ['Soup', 'Quick']);
  assert.equal(full.source, 'https://example.com/soup');
  // where it is from can be a cookbook or a person, which stays as typed
  assert.equal(D.fromForm(form({ name: 'Pie', source: ' Grandma Dorrance ' }), 'pie').source, 'Grandma Dorrance');
  assert.equal(D.fromForm(form({ name: 'Pie', source: 'Joy of Cooking, p. 42' }), 'pie').source, 'Joy of Cooking, p. 42');
  assert.equal(D.fromForm(form({ name: 'Pie', source: 'www.allrecipes.com/pie' }), 'pie').source, 'https://www.allrecipes.com/pie');
  assert.deepEqual(D.fromForm(form({ name: 'Bare' }), 'bare').ingredients, []);
  const back = D.toForm(full);
  assert.deepEqual(D.fromForm(back, 'soup'), full);
});

test('one change applies to fresh data and keeps the rest', () => {
  const data = D.parse(FIXED);
  data.recipes[0].photo = 'chili.jpg';   // a field the page does not know
  const add = D.apply(data, { type: 'add', form: form({ name: 'Salmon bowls', ingredients: 'Salmon' }) });
  assert.equal(add.recipe.id, 'salmon-bowls-2');
  assert.equal(add.message, 'Recipes: add Salmon bowls');
  assert.equal(add.data.recipes.length, data.recipes.length + 1);
  assert.equal(data.recipes.length, 11, 'the input is not changed');

  const edit = D.apply(data, { type: 'edit', id: 'white-chicken-chili', form: form({ name: 'White chicken chili', servings: '8', ingredients: 'Chicken' }) });
  assert.equal(edit.message, 'Recipes: edit White chicken chili');
  assert.deepEqual(edit.data.recipes[0], { id: 'white-chicken-chili', name: 'White chicken chili', servings: '8', ingredients: ['Chicken'], photo: 'chili.jpg' });
  assert.deepEqual(edit.data.recipes.slice(1), data.recipes.slice(1));
  assert.throws(() => D.apply(data, { type: 'edit', id: 'nope', form: form({ name: 'X' }) }), e => e.code === 'gone');

  const del = D.apply(data, { type: 'delete', id: 'salmon-bowls' });
  assert.equal(del.message, 'Recipes: delete Salmon bowls');
  assert.ok(!del.data.recipes.some(r => r.id === 'salmon-bowls'));
  assert.equal(D.apply(data, { type: 'delete', id: 'nope' }).message, null);
});

test('base64 keeps accents and apostrophes', () => {
  const s = '{"name":"Crème brûlée – Megan’s 🍮"}\n';
  assert.equal(D.fromBase64(D.toBase64(s)), s);
  assert.equal(D.toBase64(s), Buffer.from(s, 'utf8').toString('base64'));
  // GitHub wraps the base64 at 60 characters
  assert.equal(D.fromBase64(Buffer.from(FIXED).toString('base64').replace(/(.{60})/g, '$1\n')), FIXED);
});

test('search finds names, tags, ingredients, steps and notes', () => {
  const rs = D.forView(D.parse(FIXED));
  assert.deepEqual(rs.map(r => r.name), [...rs.map(r => r.name)].sort((a, b) => a.localeCompare(b)));
  const burritos = rs.find(r => r.id === 'sheet-pan-breakfast-burritos');
  assert.deepEqual(D.match(burritos, 'red').ingredients, ['Red bell pepper', 'Red onion']);
  const roast = rs.find(r => r.id === 'pepperoncini-roast');
  assert.deepEqual(D.match(roast, 'crock pot'), { ingredients: [], snippet: null });
  const tacos = rs.find(r => r.id === 'tacos-and-beans');
  assert.match(D.match(tacos, 'garnish').snippet, /garnish/);
  assert.equal(D.match(tacos, 'kale'), null);
  assert.equal(D.hl('Mac & <b>cheese</b>', 'cheese'), 'Mac &amp; &lt;b&gt;<mark>cheese</mark>&lt;/b&gt;');
  assert.equal(D.hl('a+b', '+'), 'a<mark>+</mark>b');
  assert.equal(D.safeUrl('javascript:alert(1)'), null);
  assert.equal(D.safeUrl('https://example.com/x'), 'https://example.com/x');
});

// A stand-in for the Worker's /api/recipes/file: one file with a sha. `error` is [status, code] for every call.
function fakeWorker(text, { error, conflicts = 0 } = {}) {
  const w = { text, sha: 'sha0', gets: 0, puts: [], n: 0 };
  w.fetch = async (url, opts) => {
    assert.equal(url, '/api/recipes/file');
    assert.equal(opts.headers.Authorization, 'Bearer tok');
    assert.equal(opts.cache, 'no-store');
    const reply = (s, body) => ({ ok: s < 300, status: s, json: async () => body });
    if (error) return reply(error[0], { error: error[1] });
    if (opts.method === 'GET') {
      w.gets++;
      return reply(200, { sha: w.sha, content: Buffer.from(w.text).toString('base64').replace(/(.{60})/g, '$1\n') });
    }
    const body = JSON.parse(opts.body);
    w.puts.push(body);
    if (conflicts > 0) { conflicts--; w.text = w.text.replace('"Fries"', '"Fries",\n        "Ketchup"'); w.sha = 'sha' + ++w.n; return reply(409, { error: 'changed' }); }
    if (body.sha !== w.sha) return reply(409, { error: 'changed' });
    w.text = Buffer.from(body.content, 'base64').toString('utf8');
    w.sha = 'sha' + ++w.n;
    return reply(200, { content: { sha: w.sha } });
  };
  return w;
}

test('save reads, applies one change and writes base64 UTF-8', async () => {
  const w = fakeWorker(FIXED);
  const out = await D.api('tok', w.fetch).save({ type: 'add', form: form({ name: 'Crème brûlée', ingredients: '4 egg yolks\nMegan’s vanilla' }) });
  assert.equal(w.puts.length, 1);
  const put = w.puts[0];
  assert.deepEqual(Object.keys(put).sort(), ['content', 'message', 'sha']);   // the Worker adds the branch and the name
  assert.equal(put.message, 'Recipes: add Crème brûlée');
  assert.equal(put.sha, 'sha0');
  const saved = Buffer.from(put.content, 'base64').toString('utf8');
  assert.ok(saved.endsWith('}\n'));
  const r = JSON.parse(saved).recipes.find(x => x.id === 'creme-brulee');
  assert.deepEqual(r, { id: 'creme-brulee', name: 'Crème brûlée', ingredients: ['4 egg yolks', 'Megan’s vanilla'] });
  assert.equal(out.recipe.id, 'creme-brulee');
});

test('a 409 reads the file again, keeps the other change, and saves once more', async () => {
  const w = fakeWorker(FIXED, { conflicts: 1 });
  await D.api('tok', w.fetch).save({ type: 'edit', id: 'salmon-bowls', form: form({ name: 'Salmon bowls', ingredients: 'Salmon\nRice' }) });
  assert.equal(w.gets, 2);
  assert.equal(w.puts.length, 2);
  assert.equal(w.puts[1].sha, 'sha1');
  const saved = JSON.parse(w.text);
  assert.deepEqual(saved.recipes.find(x => x.id === 'salmon-bowls').ingredients, ['Salmon', 'Rice']);
  assert.ok(saved.recipes.find(x => x.id === 'burgers-and-fries').ingredients.includes('Ketchup'), 'the change made in between is kept');
});

test('two 409s in a row give up with a plain error', async () => {
  const w = fakeWorker(FIXED, { conflicts: 2 });
  await assert.rejects(D.api('tok', w.fetch).save({ type: 'delete', id: 'salmon-bowls' }), e => e.code === 'changed' && /kept changing/.test(e.message));
  assert.equal(w.puts.length, 2);
});

test('errors are plain', async () => {
  await assert.rejects(D.api('tok', fakeWorker(FIXED, { error: [401, 'signin'] }).fetch).read(), e => e.code === 'signin' && e.message === 'You are signed out. Sign in again.');
  await assert.rejects(D.api('tok', fakeWorker(FIXED, { error: [502, 'github'] }).fetch).read(), e => /check its GitHub token/.test(e.message));
  await assert.rejects(D.api('tok', fakeWorker(FIXED, { error: [429, 'rate'] }).fetch).read(), e => e.code === 'rate');
  await assert.rejects(D.api('tok', fakeWorker(FIXED, { error: [500, 'no such code'] }).fetch).read(), e => e.code === 500 && e.message === 'The server answered with error 500.');
  await assert.rejects(D.api('tok', async () => { throw new TypeError('Load failed'); }).read(), e => e.code === 'network' && e.message === 'No connection.');
  await assert.rejects(D.api('tok', fakeWorker('{oops').fetch).read(), e => e.code === 'json');
});

test('the amount at the start of an ingredient is split off, for the bold part', () => {
  const split = l => { const a = D.amount(l); return a.qty + '|' + a.what; };
  assert.equal(split('5 strips bacon (thick-cut)'), '5 strips|bacon (thick-cut)');
  assert.equal(split('1 lb Italian sausage'), '1 lb|Italian sausage');
  assert.equal(split('4 large red potatoes'), '4 large|red potatoes');
  assert.equal(split('1 small bunch kale'), '1 small bunch|kale');
  assert.equal(split('1/4 tsp Italian seasoning'), '¼ tsp|Italian seasoning');
  assert.equal(split('1 1/2 cups flour'), '1½ cups|flour');
  assert.equal(split('2 to 3 cups water'), '2 to 3 cups|water');
  assert.equal(split('12 oz. pasta'), '12 oz.|pasta');
  assert.equal(split('4 large lemons'), '4 large|lemons');   // "l" (liters) is not the start of "lemons"
  assert.equal(split('1 chuck roast'), '1|chuck roast');
  assert.equal(split('Salt and pepper'), '|Salt and pepper');
  assert.equal(split('2'), '|2');
});

test('a time in a step gives a timer, from the first time it names', () => {
  assert.deepEqual(D.timerFor('Cook it in a pot on medium-high for 5 minutes.'), { secs: 300, note: '5 min in this step' });
  assert.deepEqual(D.timerFor('Simmer 10 to 15 minutes, until tender.'), { secs: 600, note: '10–15 min in this step' });
  assert.deepEqual(D.timerFor('Bake at 350 for 20-25 mins.'), { secs: 1200, note: '20–25 min in this step' });
  assert.deepEqual(D.timerFor('Cook on high for 6 hours or low for 8 hours.'), { secs: 21600, note: '6 hr in this step' });
  assert.deepEqual(D.timerFor('Roast 1 hour 30 minutes.'), { secs: 5400, note: '1 hr 30 min in this step' });
  assert.deepEqual(D.timerFor('Whisk 30 seconds.'), { secs: 30, note: '30 sec in this step' });
  assert.equal(D.timerFor('Heat the oven to 350.'), null);
  assert.equal(D.timerFor('Season with salt and pepper.'), null);
  assert.equal(D.clock(300), '5:00');
  assert.equal(D.clock(59), '0:59');
  assert.equal(D.clock(5400), '1:30:00');
  assert.equal(D.clock(-3), '0:00');
});

// Everyone has a book: Nicole owns two recipes (one not shared), Hayden one, and one recipe from before owners.
const BOOK = {
  recipes: [
    { id: 'tacos', name: 'Tacos', ingredients: ['Tortillas'], owner: 'Nicole' },
    { id: 'burgers', name: 'Burgers', ingredients: ['Buns'], owner: 'Nicole', shared: false },
    { id: 'chili', name: 'Chili', ingredients: ['Beans'], owner: 'Hayden' },
    { id: 'salad', name: 'Salad', ingredients: ['Lettuce'] }
  ]
};
const NICOLE = { key: 'nicole', name: 'Nicole', partner: null }, HAYDEN = { key: 'hayden', name: 'Hayden', partner: null };
const MITCHELL = { key: 'mitchell', name: 'Mitchell', partner: 'nicole' };   // shares a meal plan with Nicole
const ids = rs => rs.map(r => r.id).join();

test('a recipe keeps its owner, and shared is written only when it is not shared', () => {
  const r = D.fromForm(form({ name: 'Soup', ingredients: 'Water', shared: false }), 'soup', null, 'Madi');
  assert.deepEqual(Object.keys(r), ['id', 'name', 'ingredients', 'owner', 'shared']);
  assert.equal(r.owner, 'Madi');
  assert.equal(r.shared, false);
  const again = D.fromForm(form({ name: 'Soup', ingredients: 'Water', shared: true }), 'soup', r, 'Someone else');
  assert.equal(again.owner, 'Madi', 'an edit keeps the owner');
  assert.ok(!('shared' in again), 'shared again: the field goes');
  assert.equal(D.toForm(r).shared, false);
  const v = D.forView(BOOK);
  assert.deepEqual(v.map(x => [x.id, x.owner, x.shared]), [['burgers', 'Nicole', false], ['chili', 'Hayden', true], ['salad', '', true], ['tacos', 'Nicole', true]]);
});

test('the book: your recipes, your household’s, and the shared ones you add; the rest of the shared ones are shared with you', () => {
  const v = D.forView(BOOK);
  let s = D.shelves(BOOK, v, null);
  assert.equal(ids(s.book), 'chili,salad,tacos', 'signed out: only shared recipes');
  assert.equal(ids(s.others), '');
  s = D.shelves(BOOK, v, NICOLE);
  assert.equal(ids(s.book), 'burgers,salad,tacos');
  assert.equal(ids(s.others), 'chili');
  s = D.shelves(BOOK, v, HAYDEN);
  assert.equal(ids(s.book), 'chili,salad');
  assert.equal(ids(s.others), 'tacos', 'Nicole’s Burgers are not shared');
  s = D.shelves(BOOK, v, MITCHELL);
  assert.equal(ids(s.book), 'burgers,salad,tacos', 'the household sees all of Nicole’s recipes');
  assert.ok(D.canEdit(v.find(r => r.id === 'burgers'), MITCHELL) && !D.canEdit(v.find(r => r.id === 'chili'), MITCHELL));
  const withBooks = { ...BOOK, books: { nicole: ['chili'] } };
  assert.equal(ids(D.shelves(withBooks, v, MITCHELL).book), 'burgers,chili,salad,tacos', 'what Nicole adds is in Mitchell’s book too');
});

test('adding to the book, taking out, and a copy in place of someone else’s recipe', () => {
  let out = D.apply(BOOK, { type: 'pull', id: 'chili' }, NICOLE);
  assert.deepEqual(out.data.books, { nicole: ['chili'] });
  assert.equal(out.message, 'Recipes: add Chili to a book');
  assert.equal(D.apply(out.data, { type: 'pull', id: 'chili' }, MITCHELL).message, null, 'in the household’s book already');
  assert.throws(() => D.apply(BOOK, { type: 'pull', id: 'burgers' }, HAYDEN), e => e.code === 'gone', 'not shared');
  const unpulled = D.apply(out.data, { type: 'unpull', id: 'chili' }, MITCHELL);
  assert.ok(!('books' in unpulled.data), 'the household takes it out; an empty list and empty books go');
  assert.equal(unpulled.message, 'Recipes: take Chili out of a book');

  assert.throws(() => D.apply(BOOK, { type: 'edit', id: 'chili', form: form({ name: 'Chili!', ingredients: 'Beans' }) }, NICOLE), e => e.code === 'notyours');
  assert.throws(() => D.apply(BOOK, { type: 'delete', id: 'chili' }, NICOLE), e => e.code === 'notyours');
  assert.equal(D.apply(BOOK, { type: 'edit', id: 'tacos', form: form({ name: 'Tacos', ingredients: 'Shells' }) }, MITCHELL).recipe.owner, 'Nicole', 'the household edits, the owner stays');
  assert.equal(D.versionName('Chili', NICOLE), "Chili (Nicole's version)");
  out = D.apply(out.data, { type: 'copy', id: 'chili', form: form({ name: D.versionName('Chili', NICOLE), ingredients: 'Beans\nCorn' }) }, NICOLE);
  assert.deepEqual(out.recipe, { id: 'chili-nicoles-version', name: "Chili (Nicole's version)", ingredients: ['Beans', 'Corn'], owner: 'Nicole' });
  assert.ok(!('books' in out.data), 'the copy takes the place of the original in the book');
  assert.equal(out.data.recipes.find(r => r.id === 'chili').name, 'Chili', 'the original is as it was');
  assert.equal(out.message, "Recipes: copy Chili as Chili (Nicole's version)");
  const added = D.apply(BOOK, { type: 'add', form: form({ name: 'Pie', ingredients: 'Apples' }) }, HAYDEN).recipe;
  assert.equal(added.owner, 'Hayden');
  const gone = D.apply({ ...BOOK, books: { nicole: ['chili'], madi: ['chili', 'tacos'] } }, { type: 'delete', id: 'chili' }, HAYDEN);
  assert.deepEqual(gone.data.books, { madi: ['tacos'] }, 'a deleted recipe leaves every book');
});

test('an import file: the format in import.txt, and what AI assistants send instead', () => {
  const one = D.parseImport('{"dorranceRecipes":1,"recipes":[{"name":"Banana bread","servings":"1 loaf","tags":["Bread"],"ingredients":["3 bananas"],"steps":["1. Mash.","2) Bake 60 minutes."],"notes":"Ripe ones.","source":"Betty Crocker, page 112"}]}');
  assert.deepEqual(one, { forms: [{ name: 'Banana bread', servings: '1 loaf', tags: 'Bread', ingredients: '3 bananas', steps: 'Mash.\nBake 60 minutes.', notes: 'Ripe ones.', source: 'Betty Crocker, page 112', shared: true }], skipped: [] });
  // a bare list, "title", text with a line each, and a comma list of categories
  const loose = D.parseImport(JSON.stringify([{ title: 'Toast', ingredients: '- 1 slice bread\n- Butter', directions: 'Toast it.\nButter it.', category: 'Breakfast, quick' }]));
  assert.equal(loose.forms[0].name, 'Toast');
  assert.equal(loose.forms[0].ingredients, '1 slice bread\nButter');
  assert.equal(loose.forms[0].steps, 'Toast it.\nButter it.');
  assert.equal(loose.forms[0].tags, 'Breakfast, quick');
  // schema.org Recipe data in a @graph, with sections of steps
  const ld = D.parseImport(JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage', name: 'Not a recipe' }, { '@type': ['Recipe'], name: 'Pancakes', recipeYield: ['4', '4 servings'],
    recipeIngredient: ['1 cup flour'], recipeInstructions: [{ '@type': 'HowToSection', name: 'Batter', itemListElement: [{ '@type': 'HowToStep', text: 'Whisk.' }, { '@type': 'HowToStep', text: 'Rest 5 minutes.' }] }], url: 'https://example.com/pancakes' }] }));
  assert.deepEqual(ld.forms.map(f => [f.name, f.servings, f.steps, f.source]), [['Pancakes', '4', 'Whisk.\nRest 5 minutes.', 'https://example.com/pancakes']]);
  // a chat answer with two code blocks and words around them; a recipe with no name is left out and counted
  const chat = D.parseImport('Here you go!\n```json\n{"recipes":[{"name":"A","ingredients":[]},{"ingredients":["x"]}]}\n```\nAnd page 2:\n```json\n[{"name":"B","ingredients":["y"]}]\n```\nEnjoy.');
  assert.deepEqual(chat.forms.map(f => f.name), ['A', 'B']);
  assert.deepEqual(chat.skipped, [2]);
  // JSON with words around it and no code block
  assert.equal(D.parseImport('Sure: {"name":"C","ingredients":["z"]} — done.').forms[0].name, 'C');
  assert.throws(() => D.parseImport('banana bread and pancakes'), e => e.code === 'importjson');
  assert.throws(() => D.parseImport('{"recipes":[{"ingredients":["x"]}]}'), e => e.code === 'importnone');
  assert.throws(() => D.parseImport(JSON.stringify(Array.from({ length: D.MAX_IMPORT + 1 }, (_, i) => ({ name: 'R' + i })))), e => e.code === 'importmany');
});

test('an import is one change: new ids, the importer as owner, sharing for all', () => {
  const data = { recipes: [{ id: 'banana-bread', name: 'Banana bread', ingredients: [] }], books: { madi: ['x'] } };
  const forms = D.parseImport('[{"name":"Banana bread","ingredients":["3 bananas"]},{"name":"Pancakes","ingredients":[]}]').forms;
  const out = D.apply(data, { type: 'import', forms, shared: false }, { key: 'nicole', name: 'Nicole' });
  assert.equal(out.message, 'Recipes: import 2 recipes');
  assert.deepEqual(out.data.recipes.slice(1), [
    { id: 'banana-bread-2', name: 'Banana bread', ingredients: ['3 bananas'], owner: 'Nicole', shared: false },
    { id: 'pancakes', name: 'Pancakes', ingredients: [], owner: 'Nicole', shared: false }
  ]);
  assert.deepEqual(out.data.books, data.books);
  assert.equal(D.apply(data, { type: 'import', forms: forms.slice(1), shared: true }, { key: 'nicole', name: 'Nicole' }).message, 'Recipes: import Pancakes');
  assert.equal(D.apply(data, { type: 'import', forms: [], shared: true }, null).message, null);
});

test('categories: rename, color and delete on every recipe, in one change', () => {
  const data = { recipes: [
    { id: 'a', name: 'A', tags: ['Grill', 'Soup'], ingredients: [] },
    { id: 'b', name: 'B', tags: ['grill'], ingredients: [] },
    { id: 'c', name: 'C', tags: ['BBQ', 'Grill'], ingredients: [] },
    { id: 'd', name: 'D', ingredients: [] }
  ], colors: { grill: 'rust' } };
  const ren = D.apply(data, { type: 'category', name: 'Grill', to: '  BBQ ' }, null);
  assert.equal(ren.message, 'Recipes: rename category Grill to BBQ');
  assert.deepEqual(ren.data.recipes.map(r => r.tags), [['BBQ', 'Soup'], ['BBQ'], ['BBQ'], undefined], 'in its place, and once when a recipe has both');
  assert.deepEqual(ren.data.colors, { bbq: 'rust' }, 'the color goes with the name');
  assert.ok(!('tags' in ren.data.recipes[3]));
  const col = D.apply(data, { type: 'category', name: 'Grill', to: 'Grill', color: 'butter' }, null);
  assert.equal(col.message, 'Recipes: color category Grill butter');
  assert.deepEqual(col.data.colors, { grill: 'butter' });
  assert.equal(D.apply(data, { type: 'category', name: 'Grill', to: 'Grill', color: 'rust' }, null).message, null, 'no change, no commit');
  assert.equal(D.apply(data, { type: 'category', name: 'Soup', to: 'Soups', color: 'nope' }, null).data.colors.soups, undefined, 'only the four colors');
  assert.deepEqual(D.apply(data, { type: 'category', name: 'Soup', to: 'a, b' }, null).data.recipes[0].tags, ['Grill', 'a b'], 'no commas: they split categories');
  const del = D.apply(data, { type: 'uncategory', name: 'grill' }, null);
  assert.equal(del.message, 'Recipes: delete category grill');
  assert.deepEqual(del.data.recipes.map(r => r.tags), [['Soup'], undefined, ['BBQ'], undefined]);
  assert.ok(!('colors' in del.data) && !('tags' in del.data.recipes[1]));
  assert.equal(D.apply(data, { type: 'uncategory', name: 'Nothing' }, null).message, null);
});
