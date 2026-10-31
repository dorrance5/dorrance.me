const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../data.js');
const car = (fuel = []) => ({ id: 'car', name: 'Car', tank: 15, notes: '', archived: false, fuel, costs: [], reminders: [] });
const fill = (id, odo, gal, extra = {}) => ({ id, date: '2026-01-01', odo, gal, price: 3, total: gal * 3, partial: false, reset: false, ...extra });

test('MPG includes partial fills, resets gaps, and starts only at a full tank', () => {
  const c = car([fill('a', 100, 5, {partial:true}), fill('b', 200, 5), fill('c', 300, 4, {partial:true}), fill('d', 500, 6), fill('e', 800, 10, {reset:true}), fill('f', 1000, 8)]);
  assert.deepEqual(T.fills(c).map(f => f.mpg), [null,null,null,30,null,25]);
  assert.equal(T.stats(c, 'all', '2026-10-31').mpg, 500/18);
  assert.equal(T.series(c, 'mpg', 'all', '2026-10-31')[0].x0, 200);
});
test('archive, restore and permanent delete preserve the original input', () => {
  const original = {cars:[car([fill('a',100,5)])]};
  const gone = T.apply(original, [{op:'gone',car:'car',list:'fuel',id:'a',date:'2026-10-31'}]);
  assert.equal(T.live(gone.cars[0]).fuel.length,0);
  assert.equal(T.live(gone.cars[0]).binned.length,1);
  assert.equal(original.cars[0].fuel[0].gone,undefined);
  const back = T.apply(gone,[{op:'back',car:'car',list:'fuel',id:'a'}]);
  assert.equal(T.live(back.cars[0]).fuel.length,1);
  assert.equal(T.apply(back,[{op:'unfill',car:'car',id:'a'}]).cars[0].fuel.length,0);
});
test('validation rejects impossible dates, invalid numbers and archive lists', () => {
  for(const patch of [{date:'2026-02-30'},{gal:0},{odo:Infinity},{price:-1},{id:'bad/id'}])
    assert.equal(T.check({op:'fill',car:'car',...fill('a',100,5),...patch}),null);
  assert.equal(T.check({op:'gone',car:'car',id:'a',list:'members',date:'2026-01-01'}),null);
  assert.equal(T.addMonths('2024-01-31',1),'2024-02-29');
  assert.equal(T.addMonths('2026-01-31',1),'2026-02-28');
});
test('reminders reset from the latest matching service and respect both intervals', () => {
  const c = car([fill('a',1000,5,{date:'2026-01-01'}),fill('b',4000,10,{date:'2026-02-01'})]);
  c.costs = [{id:'c',name:'OIL CHANGE',date:'2026-01-31',odo:3000,cost:50,kind:'service',note:''}];
  c.reminders = [{id:'r',name:'Oil change',miles:5000,months:1}];
  const r = T.due(c,'2026-03-01')[0];
  assert.equal(r.atOdo,8000); assert.equal(r.atDate,'2026-02-28'); assert.equal(r.late,true);
});
test('weekly miles conserve distance across week boundaries', () => {
 const c=car([fill('a',100,5,{date:'2026-01-01'}),fill('b',800,10,{date:'2026-01-15'})]);
 assert.equal(T.series(c,'miles','all','2026-01-31').reduce((n,p)=>n+p.v,0),700);
});
