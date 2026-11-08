// Run: node --test recipes/test/*.test.js
// The meal plan and grocery list functions (recipes/meals.js). worker/test/meals.test.js checks the Worker side.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../data.js');
const M = require('../meals.js');

const BOOK = D.forView(D.parse(fs.readFileSync(path.join(__dirname, '..', 'recipes.json'), 'utf8')));
const recipe = id => BOOK.find(r => r.id === id);
const list = o => ({ recipes: [], extra: [], got: [], gone: [], ...o });
const on = (...ids) => ids.map(id => ({ id, name: recipe(id).name }));

test('a week runs Saturday to Friday, and the dates read well', () => {
  const tue = new Date(2026, 9, 27, 18, 30);   // Tuesday, October 27
  const w = M.week(tue, 0), next = M.week(tue, 1);
  assert.deepEqual(w.map(d => d.date), ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
  assert.deepEqual(w.map(d => d.day), ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  assert.deepEqual(w.map(d => d.today), [false, false, false, true, false, false, false]);
  assert.deepEqual(w.filter(d => d.past).length, 3);
  assert.equal(w[3].long, 'Tuesday');
  assert.equal(M.span(w), 'Oct 24–30');
  assert.equal(M.span(next), 'Oct 31–Nov 6');
  assert.equal(M.week(new Date(2026, 9, 30), 0)[0].date, '2026-10-24', 'Friday is the end of the week');
  assert.equal(M.week(new Date(2026, 9, 31), 0)[0].date, '2026-10-31', 'Saturday starts a new week');
  assert.equal(M.span(M.week(new Date(2026, 11, 30), 0)), 'Dec 26–Jan 1');
});

test('an item is its name without the amount', () => {
  const k = l => M.key(D.amount(l).what);
  assert.equal(k('1 lb Italian sausage (casings removed)'), 'italian sausage');
  assert.equal(k('Pulled pork (Costco)'), 'pulled pork');
  assert.equal(k('2 cups  Chicken broth.'), 'chicken broth');
  assert.equal(k('Salt and pepper'), 'salt and pepper');
  assert.equal(k('For the sauce:'), '', 'a heading is not an item');
  assert.deepEqual(M.keysOf({ ingredients: ['Buns', '4 buns', 'Burgers'] }, D.amount), ['buns', 'burgers']);
});

test('the same item from two recipes is one line, with both amounts', () => {
  const book = [
    { id: 'a', name: 'Burgers', ingredients: ['1 lb ground beef', '4 Buns', 'Lettuce'] },
    { id: 'b', name: 'Sloppy joes', ingredients: ['2 lb ground beef', 'Buns (brioche)', 'Ketchup'] }
  ];
  const lines = M.groceries(list({ recipes: [{ id: 'a', name: 'Burgers' }, { id: 'b', name: 'Sloppy joes' }], extra: [{ key: 'ketchup', text: 'Ketchup' }, { key: 'milk', text: '1 gallon milk' }], got: ['lettuce'] }), book, D.amount);
  assert.deepEqual(lines.map(l => [l.name, l.qty.join(' + '), l.for.join(', '), l.extra, l.got]), [
    ['Ground beef', '1 lb + 2 lb', 'Burgers, Sloppy joes', false, false],
    ['Buns', '4', 'Burgers, Sloppy joes', false, false],
    ['Lettuce', '', 'Burgers', false, true],
    ['Ketchup', '', 'Sloppy joes', true, false],
    ['Milk', '1 gallon', '', true, false]
  ]);
  const gone = M.groceries(list({ recipes: [{ id: 'a', name: 'Burgers' }, { id: 'x', name: 'Deleted' }], gone: ['buns'] }), book, D.amount);
  assert.deepEqual(gone.map(l => l.key), ['ground beef', 'lettuce'], 'a cleared item and a deleted recipe show nothing');
});

test('Clear takes off what is in Got it, and each recipe with nothing left', () => {
  const l = list({ recipes: on('burgers-and-fries', 'tacos-and-beans'), extra: [{ key: 'milk', text: 'Milk' }], got: ['milk', 'burgers', 'buns', 'fries'] });
  const op = M.clearing(l, BOOK, D.amount);
  assert.deepEqual(op, { op: 'clear', keys: ['burgers', 'buns', 'fries', 'milk'], recipes: ['burgers-and-fries'] });
  const after = M.apply({ list: l }, [M.check(op)], 'Mitchell', '2026-10-24').list;
  assert.deepEqual(after.recipes.map(r => r.id), ['tacos-and-beans']);
  assert.deepEqual(M.groceries(after, BOOK, D.amount).map(x => x.got), M.groceries(after, BOOK, D.amount).map(() => false));
});

test('the phone shows a change the way the Worker keeps it', () => {
  const ops = [
    { op: 'day', date: '2026-10-24', recipe: 'tacos-and-beans', name: 'Tacos and beans' },
    { op: 'add', recipe: 'tacos-and-beans', name: 'Tacos and beans', keys: M.keysOf(recipe('tacos-and-beans'), D.amount) },
    { op: 'extra', text: ' Paper   towels ', key: 'paper towels' }
  ].map(M.check);
  const d = M.apply(null, ops, 'Nicole', '2026-10-24');
  assert.deepEqual(d.days, { '2026-10-24': { recipe: 'tacos-and-beans', name: 'Tacos and beans', by: 'Nicole' } });
  assert.deepEqual(d.list.extra, [{ key: 'paper towels', text: 'Paper towels' }]);
  assert.deepEqual(M.tidy(JSON.parse(JSON.stringify(d))), d, 'stored and read back, it is the same');
  assert.deepEqual(M.tidy({ days: { x: 1, '2026-10-24': { note: 'Hi' } }, list: { recipes: [{ id: '<x>' }], got: ['a', 'a', 7] } }),
    { days: {}, list: { recipes: [], extra: [], got: ['a'], gone: [] } }, 'broken data is dropped');
});
