const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../data.js'), I = require('../import.js'), X = require('./rtexport.cjs');
const fixture = require('./fixture.json');
const found = () => fixture.cars.map(c=>I.parse(X.csv(c),c.name+'.csv'));
test('CSV and ZIP import preserve fuel, expenses, reminders, and repeat without duplicates', async () => {
 const zip=X.zip(fixture.cars.map(c=>({name:c.name+'.csv',text:X.csv(c)})));
 const files=await I.unzip(zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength));
 assert.equal(files.length,fixture.cars.length);
 const parsed=files.map(f=>I.parse(f.text,f.name));
 const ops=I.plan(parsed,[],'2026-10-31').flatMap(p=>p.ops);
 assert.ok(ops.every(T.check));
 const state=T.apply({},ops);
 for(const c of fixture.cars){
  const imported=state.cars.find(x=>x.name===c.name);
  assert.equal(imported.fuel.length,c.fuel.length);
  assert.equal(imported.costs.length,c.costs.length);
  assert.deepEqual(T.fills(imported).map(f=>f.mpg),T.fills(c).map(f=>f.mpg));
 }
 assert.equal(I.plan(parsed,state.cars,'2026-10-31').flatMap(p=>p.ops).length,0);
 assert.ok(state.cars.find(c=>c.name==='Old Civic').archived);
});
test('quoted commas, quotes and newlines survive; invalid input is rejected', async () => {
 const c=structuredClone(fixture.cars[0]); c.notes='First, second\nA "quote"'; c.costs[0].note=c.notes;
 const p=I.parse(X.csv(c),'car.csv'); assert.equal(p.notes,c.notes); assert.equal(p.costs[0].note,c.notes);
 assert.equal(I.parse('not an export','bad.csv'),null);
 assert.equal(I.day('2026-2-30'),null);
 await assert.rejects(I.unzip(new ArrayBuffer(5)));
});
test('reimport leaves archived records and existing car metadata alone',()=>{
 const parsed=found(), state=T.apply({},I.plan(parsed,[],'2026-10-31').flatMap(p=>p.ops));
 const c=state.cars[0]; c.fuel[0].gone='2026-10-31'; c.notes='My notes';
 assert.equal(I.plan(parsed,state.cars,'2026-10-31').flatMap(p=>p.ops).length,0);
});
