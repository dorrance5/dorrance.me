// Run: node --test tvmount/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../geometry.js');

const near = (a, b, msg, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);
// a tab built from the defaults plus deep-merged overrides, e.g. tab(BASE, { tv: { w: 57 } })
function merge(dst, src) {
  for (const [k, v] of Object.entries(src || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k], v);
    else dst[k] = Array.isArray(v) ? v.slice() : v;
  }
  return dst;
}
const tab = (...overs) => overs.reduce((t, o) => merge(t, o), G.newTab('Test'));
const BASE = { tv: { src: 'measured', w: 57.125, h: 32.75 }, mount: { holesToTop: 4.5 }, ref: { kind: 'floor', floor: { edge: 'center', value: 42 } } };

test('parses fractions every way they get typed', () => {
  for (const s of ['48 3/8', '48-3/8', '48.375', '48 - 3/8', '48  3/8"', '48 3/8 in', '48⅜']) near(G.parseInches(s), 48.375, s);
  near(G.parseInches('3/8'), 0.375);
  near(G.parseInches('-1 1/2'), -1.5);
  near(G.parseInches('−1-1/2'), -1.5);
  near(G.parseInches('4\''), 48);
  near(G.parseInches('5\'-3 1/2"'), 63.5);
  near(G.parseInches('5ft 3in'), 63);
  near(G.parseInches('48.'), 48);
  near(G.parseInches('.5'), 0.5);
  near(G.parseInches('51/8'), 6.375);
  assert.equal(G.parseInches(''), null);
  assert.equal(G.parseInches('   '), null);
  assert.ok(Number.isNaN(G.parseInches('abc')));
  assert.ok(Number.isNaN(G.parseInches('1/0')));
  assert.ok(Number.isNaN(G.parseInches('-')));
});

test('formats to the chosen precision like a tape reads', () => {
  assert.equal(G.formatInches(48.375), '48 3/8"');
  assert.equal(G.formatInches(48.4), '48 3/8"');
  assert.equal(G.formatInches(47.99), '48"');
  assert.equal(G.formatInches(0.03), '0"');
  assert.equal(G.formatInches(-0.5), '−1/2"');
  assert.equal(G.formatInches(-0.01), '0"');
  assert.equal(G.formatInches(48.4375, { prec: 8 }), '48 1/2"');
  assert.equal(G.formatInches(48.40625, { prec: 32 }), '48 13/32"');
  assert.equal(G.formatInches(48.375, { dec: true }), '48.38"');
  assert.equal(G.formatInches(48, { dec: true }), '48"');
  assert.equal(G.formatInches(48.375, { unit: '' }), '48 3/8');
  assert.equal(G.formatInches(NaN), '—');
  assert.equal(G.formatExact(48.375), '48 3/8"');
  assert.equal(G.formatExact(10 + 1 / 64), '10 1/64"');
  assert.equal(G.formatExact(1 / 3), '0.333"');
  assert.equal(G.fill('drill at {52.75}', x => G.formatInches(x)), 'drill at 52 3/4"');
});

test('standard size estimate is a 16:9 screen plus a typical bezel', () => {
  const s = G.sizeEstimate(65);
  near(s.w, 65 * 16 / Math.hypot(16, 9) + 0.5);
  near(s.h, 65 * 9 / Math.hypot(16, 9) + 0.9);
  near(s.w, 57.152, '', 1e-3);
  near(s.h, 32.767, '', 1e-3);
  assert.equal(G.sizeEstimate(0), null);
  assert.ok(G.SIZES[0] === 43 && G.SIZES[G.SIZES.length - 1] === 98);
});

test('simple, floor, TV center at 42', () => {
  const r = G.compute(tab(BASE), { mode: 'simple' });
  assert.ok(r.ok);
  near(r.m.top, 58.375);
  near(r.m.center, 42);
  near(r.m.bottom, 25.625);
  near(r.m.hole, 53.875);
  near(r.aff.hole, 53.875);
  assert.deepEqual(r.missing, []);
  assert.equal(r.rows[0].id, 'hole');
  near(r.rows[0].v, 53.875);
  assert.ok(r.sketch && r.sketch.items.length > 5);
});

test('floor, TV bottom at 36', () => {
  const r = G.compute(tab(BASE, { ref: { floor: { edge: 'bottom', value: 36 } } }), { mode: 'simple' });
  near(r.m.top, 68.75);
  near(r.m.hole, 64.25);
});

test('floor, TV top at 70 needs no TV height for the holes', () => {
  const r = G.compute(tab({ tv: { src: 'measured', w: null, h: null }, mount: { holesToTop: 4.5 }, ref: { floor: { edge: 'top', value: 70 } } }), { mode: 'simple' });
  near(r.m.hole, 65.5);
  assert.equal(r.m.center, null);
  assert.deepEqual(r.missing, []);
});

test('mantle, 4 inch gap', () => {
  const r = G.compute(tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'bottom', value: 4, h: 54 } } }), { mode: 'simple' });
  near(r.m.bottom, 4);
  near(r.m.top, 36.75);
  near(r.m.hole, 32.25);
  near(r.aff.hole, 86.25);
  near(r.aff.center, 74.375);
  assert.match(r.rows[0].alt, /above floor/);
});

test('mantle without its height still gives the marks above the mantle', () => {
  const r = G.compute(tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'bottom', value: 4 } } }), { mode: 'simple' });
  near(r.m.hole, 32.25);
  assert.equal(r.aff.hole, null);
  assert.equal(r.floorKnown, false);
});

test('ceiling, 6 inch gap to TV top', () => {
  const r = G.compute(tab(BASE, { ref: { kind: 'ceiling', ceiling: { edge: 'top', value: 6, h: 96 } } }), { mode: 'simple' });
  near(r.m.top, 6);
  near(r.m.hole, 10.5);
  near(r.m.bottom, 38.75);
  near(r.aff.hole, 85.5);
  assert.equal(r.rows[0].sub, 'below ceiling');
});

test('standard size feeds the TV height', () => {
  const r = G.compute(tab({ tv: { src: 'size', size: 65 }, mount: { holesToTop: 4.5 }, ref: { floor: { edge: 'center', value: 42 } } }), { mode: 'simple' });
  assert.ok(r.tv.est);
  near(r.m.top, 42 + G.sizeEstimate(65).h / 2);
});

test('missing inputs are listed, not guessed', () => {
  const r = G.compute(G.newTab(), { mode: 'simple' });
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes('mount.holesToTop'));
  assert.ok(r.missing.includes('ref.floor.value'));
  assert.ok(r.missing.includes('tv.size'));            // new tabs start on a standard size
  assert.equal(r.sketch, null);
  const t = G.newTab();
  assert.equal(t.tv.src, 'size');
  assert.equal(t.center.mode, 'half');
  assert.equal(t.mount.holesFrom, 'top');
});

test('top holes measured down to the TV bottom', () => {
  // 32 3/4 tall, holes 28 1/4 above the bottom: the same 4 1/2 to the top as BASE
  const r = G.compute(tab(BASE, { mount: { holesFrom: 'bottom', holesToTop: 99, holesToBottom: 28.25 } }), { mode: 'simple' });
  near(r.chain.hung, 4.5);
  near(r.m.hole, 53.875);
  near(r.sketch.items.find(d => d.t === 'dim' && d.key === 'chain').v, 28.25);
  assert.match(G.fill(r.rows.find(x => x.id === 'chain').alt, G.formatInches), /height 32 3\/4" − 28 1\/4" to bottom/);
  const sag = G.compute(tab(BASE, { mount: { holesFrom: 'bottom', holesToBottom: 28.25, sag: 0.25 } }), { mode: 'pro' });
  near(sag.m.hole, 54.125);
  const noH = G.compute(tab(BASE, { tv: { h: null }, mount: { holesFrom: 'bottom', holesToBottom: 28.25 }, ref: { floor: { edge: 'top', value: 70 } } }), { mode: 'simple' });
  assert.ok(noH.missing.includes('tv.h'));
  assert.ok(G.compute(tab(BASE, { mount: { holesFrom: 'bottom' } }), { mode: 'simple' }).missing.includes('mount.holesToBottom'));
});

test('pro split chain with sag', () => {
  const t = tab(BASE, { tv: { w: 57.125, h: 32.75, vesaTop: 7.5 }, mount: { holesToTop: 4.5, chain: 'split', hookDrop: 1.25, armDrop: 0.5, sag: 0.125 } });
  const r = G.compute(t, { mode: 'pro' });
  near(r.chain.measured, 5.75);
  near(r.chain.hung, 5.625);
  near(r.m.hole, 58.375 - 5.625);
  // Simple mode ignores the chain and the sag and uses the one measurement
  const s = G.compute(t, { mode: 'simple' });
  near(s.chain.hung, 4.5);
  near(s.m.hole, 53.875);
});

test('pro sag on a single measurement drills higher by the sag', () => {
  const r = G.compute(tab(BASE, { mount: { holesToTop: 4.5, sag: 0.25 } }), { mode: 'pro' });
  near(r.m.hole, 53.875 + 0.25);
});

test('finished floor offset: plan to finished floor, measure from today’s floor', () => {
  const t = tab(BASE, { ref: { ff: 0.75 } });
  const r = G.compute(t, { mode: 'pro' });
  near(r.m.center, 42.75);
  near(r.aff.center, 42);
  near(r.m.hole, 54.625);
  assert.match(r.rows[0].alt, /finished floor/);
  near(G.compute(t, { mode: 'simple' }).m.center, 42);
});

test('mantle measured at both ends keeps the gap at the high end', () => {
  const t = tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'bottom', value: 4, h: 54, hR: 54.5, len: 60 } } });
  const r = G.compute(t, { mode: 'pro' });
  const slope = 0.5 / 60, rise = slope * 57.125 / 2;
  near(r.ref.refNow, 54.25);
  near(r.ref.rise, rise);
  near(r.ref.gapR, 4);
  near(r.ref.gapL, 4 + 2 * rise);
  near(r.m.bottom, 4 + rise);
  near(r.aff.bottom, 54.25 + 4 + rise);
  near(r.m.hole, 4 + rise + 32.75 - 4.5);
  // without a length, the ends are taken at the TV edges
  const r2 = G.compute(tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'bottom', value: 4, h: 54, hR: 54.5 } } }), { mode: 'pro' });
  near(r2.ref.rise, 0.25);
  near(r2.aff.bottom, 58.5);
  // simple mode treats the mantle as level at the one height
  near(G.compute(t, { mode: 'simple' }).aff.bottom, 58);
});

test('center tool', () => {
  assert.deepEqual(G.centerTool({ mode: 'two', from: 'left', a: 30, b: 94 }), { mode: 'two', from: 'left', pos: 62, a: 30, b: 94, half: 32 });
  assert.equal(G.centerTool({ mode: 'half', from: 'right', d: 150 }).pos, 75);
  assert.equal(G.centerTool({ mode: 'half', from: 'right', d: 150 }).from, 'left');   // either end: counts from the left
  assert.equal(G.centerTool({ mode: 'two', a: 30 }), null);
  near(G.centerTool({ mode: 'two', a: 30.125, b: 94.5 }).pos, 62.3125);
});

test('studs fill on 16 inch centers', () => {
  assert.deepEqual(G.fillStuds(5.25, 16, -40, 40), [-26.75, -10.75, 5.25, 21.25, 37.25]);
  assert.deepEqual(G.fillStuds(5.25, 0, -40, 40), []);
});

test('plate slide check', () => {
  let s = G.slideCheck([-10.75, 5.25, 21.25], 0, 24, 3, 2);
  assert.ok(s.ok); near(s.P, 0); near(s.left, 3); near(s.right, 3);
  assert.deepEqual(s.hits, [-10.75, 5.25]);
  s = G.slideCheck([-14, 2, 18], 0, 24, 3, 2);
  assert.ok(s.ok); near(s.P, -2); near(s.used, 2); near(s.left, 5); near(s.right, 1);
  s = G.slideCheck([-14, 2, 18], 0, 24, 1, 2);
  assert.equal(s.ok, false); assert.equal(s.reason, 'slide'); near(s.short, 1);
  s = G.slideCheck([0], 0, 24, 3, 2);
  assert.equal(s.ok, false); assert.equal(s.reason, 'span');
  // VESA off center moves the target for the plate
  s = G.slideCheck([-8, 8], 1.4375, 24, 0, 2);
  assert.ok(s.ok); near(s.P, 1.4375);
});

test('studs measured from the edge convert to the center line', () => {
  const t = tab(BASE, { center: { mode: 'two', from: 'left', a: 30, b: 94 }, studs: { from: 'edge', list: [51.25, 67.25] }, mount: { holesToTop: 4.5, plateW: 26, slide: 2 } });
  const r = G.compute(t, { mode: 'pro' });
  assert.deepEqual(r.studs, [-10.75, 5.25]);
  assert.ok(r.slide.ok);
  assert.equal(r.drill.length, 2);
  const right = G.compute(tab(BASE, { center: { mode: 'two', from: 'right', a: 30, b: 94 }, studs: { from: 'edge', list: [51.25] } }), { mode: 'pro' });
  assert.deepEqual(right.studs, [10.75]);
  // half a distance has no left or right: studs count from the left end
  const half = G.compute(tab(BASE, { center: { mode: 'half', from: 'right', d: 124 }, studs: { from: 'edge', list: [51.25] } }), { mode: 'pro' });
  assert.deepEqual(half.studs, [-10.75]);
  // the sketch names both ends of the whole distance
  assert.deepEqual(half.sketch.items.filter(i => i.cls === 'edge').map(i => i.text), ['Left edge', 'Right edge']);
  assert.deepEqual(G.compute(t, { mode: 'simple' }).studs, []);
});

test('VESA centered and drill points on two rows', () => {
  const t = tab(BASE, { tv: { w: 57.125, h: 32.75, vesaW: 400, vesaH: 300 }, mount: { holesToTop: 4.5, plateW: 26, plateH: 10, holeDown: 1, slide: 0 }, studs: { list: [-8, 8] } });
  const r = G.compute(t, { mode: 'pro' });
  near(r.vesa.x, 0);
  near(r.vesa.w, 400 / 25.4);                           // typed in mm, drawn in inches
  near(r.vesa.h, 300 / 25.4);
  near(r.plateX, 0);
  assert.equal(r.drill.length, 4);
  near(r.drill[1].y, 53.875 - 8);
  near(r.plate.y1, 54.875);
  near(r.plate.x0, -13);
});

test('adjustment left after drilling', () => {
  const t = tab(BASE, { mount: { holesToTop: 4.5, plateW: 26, slide: 3, adjUp: 0.5, adjDown: 1 }, studs: { list: [-14, 2, 18] } });
  const r = G.compute(t, { mode: 'pro' });
  assert.deepEqual(r.adjust, { up: 0.5, down: 1, left: 5, right: 1 });
});

test('a box already in the wall, measured to a corner', () => {
  const mount = { holesToTop: 4.5, plateW: 26, plateH: 10, holeDown: 1 };
  const set = o => G.compute(tab(BASE, { mount, box: Object.assign({ on: true, place: 'set', w: 8, h: 8 }, o) }), { mode: 'pro' });
  const r = set({ corner: 'bl', side: 'left', cornerH: 40, cornerX: 7 });
  assert.ok(r.box.set);
  near(r.box.at.y0, 40); near(r.box.at.x0, -7); near(r.box.at.x1, 1);
  assert.equal(r.box.shows.length, 0);
  assert.ok(!r.warnings.some(w => /box/.test(w)));   // behind the plate is fine
  // the same box, measured to its top right corner
  const tr = set({ corner: 'tr', side: 'right', cornerH: 48, cornerX: 1 });
  near(tr.box.at.y0, 40); near(tr.box.at.x0, -7);
  const low = set({ cornerH: 20 });
  assert.equal(low.box.shows[0].k, 'below');
  assert.ok(low.warnings.some(w => /box shows/.test(w)));
  const stud = G.compute(tab(BASE, { mount, box: { on: true, place: 'set', w: 8, h: 8, cornerH: 40, cornerX: 2 }, studs: { list: [-1] } }), { mode: 'pro' });
  assert.ok(stud.warnings.some(w => /crosses a stud/.test(w)));
});

test('recessed box: behind the TV, half below the plate', () => {
  const t = tab(BASE, { mount: { holesToTop: 4.5, plateW: 26, plateH: 10, holeDown: 1 }, box: { on: true, w: 8, h: 8 } });
  const r = G.compute(t, { mode: 'pro' });
  assert.equal(r.box.zones.length, 1);
  const z = r.box.zones[0];
  near(z.y0, 27.625); near(z.y1, 56.375);
  near(z.x0, -26.5625);
  assert.ok(r.box.fits);
  near(r.box.at.cy, 44.875); assert.equal(r.box.at.half, 'below');   // centered on the plate bottom
  near(r.box.at.x, 0);
  // too tall to hang half below the plate: half above it
  const tall = G.compute(tab(BASE, { mount: { holesToTop: 4.5, plateW: 26, plateH: 10, holeDown: 1 }, box: { on: true, w: 8, h: 22 } }), { mode: 'pro' });
  near(tall.box.at.cy, 44.875 - 0); assert.ok(tall.box.fits);
  const one = G.compute(tab(BASE, { mount: { holesToTop: 4.5, plateW: 26, plateH: 10, holeDown: 1 }, box: { on: true, w: 8, h: 8 }, studs: { list: [0] } }), { mode: 'pro' });
  near(Math.abs(one.box.at.x), 4.75);
  const big = G.compute(tab(BASE, { mount: { holesToTop: 4.5, plateW: 26, plateH: 10, holeDown: 1 }, box: { on: true, w: 8, h: 30 } }), { mode: 'pro' });
  assert.equal(big.box.fits, false);
  assert.ok(big.warnings.some(w => /box/.test(w)));
});

test('viewing angle from seated eye height', () => {
  const t = tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'bottom', value: 4, h: 54 } }, view: { dist: 144 } });
  const r = G.compute(t, { mode: 'pro' });
  near(r.view.center, Math.atan(34.375 / 144) * 180 / Math.PI);
  near(r.view.center, 13.426, '', 1e-3);
  assert.equal(r.view.rating, 'good');
  near(r.view.maxCenter, 40 + 144 * Math.tan(Math.PI / 12));
  const high = G.compute(tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'bottom', value: 4, h: 60 } }, view: { dist: 72, eye: 38 } }), { mode: 'pro' });
  assert.equal(high.view.rating, 'bad');
  assert.ok(high.warnings.some(w => /eye level/.test(w)));
  const noFloor = G.compute(tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'bottom', value: 4 } }, view: { dist: 144 } }), { mode: 'pro' });
  assert.equal(noFloor.view.need, 'floor');
});

test('as built vs predicted', () => {
  const r = G.compute(tab(BASE, { built: { top: 58.125, bottom: 25.375 } }), { mode: 'pro' });
  near(r.built.dTop, -0.25); near(r.built.dBot, -0.25); near(r.built.avg, -0.25);
  near(r.built.sag, 0.25);
  near(r.built.hErr, 0);
  const c = G.compute(tab(BASE, { ref: { kind: 'ceiling', ceiling: { edge: 'top', value: 6, h: 96 } }, built: { top: 6.25 } }), { mode: 'pro' });
  near(c.built.dTop, -0.25);
  assert.equal(G.compute(tab(BASE, { built: { top: 58 } }), { mode: 'simple' }).built, null);
});

test('warnings for impossible placements', () => {
  const r = G.compute(tab(BASE, { ref: { kind: 'ceiling', ceiling: { edge: 'center', value: 10, h: 96 } } }), { mode: 'simple' });
  assert.ok(r.warnings.some(w => /above the ceiling/.test(w)));
  const m = G.compute(tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'center', value: 10, h: 54 } } }), { mode: 'simple' });
  assert.ok(m.warnings.some(w => /below the mantle/.test(w)));
  const h = G.compute(tab(BASE, { mount: { holesToTop: -1 } }), { mode: 'simple' });
  assert.ok(h.warnings.some(w => /above the TV top/.test(w)));
});

test('sketch dims match the numbers you measure', () => {
  const r = G.compute(tab(BASE, { ref: { ff: 0.75 } }), { mode: 'pro' });
  const dims = r.sketch.items.filter(i => i.t === 'dim' && i.side === 'left');
  const hole = dims.find(d => d.key === 'hole');
  near(hole.v, r.m.hole);
  const c = G.compute(tab(BASE, { ref: { kind: 'ceiling', ceiling: { edge: 'top', value: 6, h: 96 } } }), { mode: 'simple' });
  near(c.sketch.items.find(d => d.t === 'dim' && d.key === 'hole').v, 10.5);
});

test('soundbar on the wall, a gap below the TV', () => {
  const r = G.compute(tab(BASE, { bar: { kind: 'wall', w: 45, h: 3.25, holesToTop: 1.5 } }), { mode: 'simple' });
  near(r.bar.gap, 2);                       // default gap
  near(r.bar.m.top, 23.625);                // TV bottom 25 5/8 - 2
  near(r.bar.m.bottom, 20.375);
  near(r.bar.m.hole, 22.125);
  const hole = r.rows.find(x => x.id === 'barhole');
  near(hole.v, 22.125);
  near(r.sketch.items.find(d => d.t === 'dim' && d.key === 'barhole').v, 22.125);
  assert.ok(r.sketch.items.some(i => i.t === 'rect' && i.cls === 'sbar'));
  const g = G.compute(tab(BASE, { bar: { kind: 'wall', h: 3, gap: 4 } }), { mode: 'simple' });
  near(g.bar.m.top, 21.625);
  assert.equal(g.bar.hole, null);
  assert.ok(!g.sketch.items.some(i => i.cls === 'sbar'));   // no width, nothing to draw
});

test('soundbar centered between the TV and what is under it', () => {
  // TV center 22 3/8 above the mantle puts the TV bottom at 6
  const m = G.compute(tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'center', value: 22.375, h: 54 } }, bar: { kind: 'wall', place: 'center', h: 3 } }), { mode: 'simple' });
  near(m.bar.gap, 1.5);
  near(m.bar.m.top, 4.5);
  near(m.bar.m.bottom, 1.5);
  near(m.bar.aff.top, 58.5);
  const f = G.compute(tab(BASE, { bar: { kind: 'wall', place: 'center', h: 3, below: 18 } }), { mode: 'simple' });
  near(f.bar.m.bottom - 18, 25.625 - f.bar.m.top);           // same gap above and below
  assert.equal(f.bar.under.what, 'console');
  const c = G.compute(tab(BASE, { ref: { kind: 'ceiling', ceiling: { edge: 'top', value: 6 } }, bar: { kind: 'wall', place: 'center', h: 3 } }), { mode: 'simple' });
  assert.deepEqual(c.bar.need, ['floor']);
  const tight = G.compute(tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'top', value: 34.75, h: 54 } }, bar: { kind: 'wall', place: 'center', h: 3 } }), { mode: 'simple' });
  assert.ok(tight.warnings.some(w => /more room between the TV and the mantle/.test(w)));
});

test('with a soundbar, the bottom you measure to is the soundbar bottom', () => {
  // mantle to bar bottom 2, a 3 1/4 bar flush under the TV: TV bottom at 5 1/4
  // (an attachment has no gap, even when one was saved for a wall bar)
  const r = G.compute(tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'bottom', value: 2 } }, bar: { kind: 'tv', h: 3.25, gap: 0.5, holesToTop: 2 } }), { mode: 'simple' });
  assert.equal(r.ref.edge, 'bar');
  near(r.bar.gap, 0);
  near(r.bar.m.bottom, 2);
  near(r.bar.m.top, 5.25);
  near(r.m.bottom, 5.25);
  near(r.m.hole, 33.5);
  near(r.bar.clear, 2);
  near(r.sketch.items.find(d => d.t === 'dim' && d.key === 'barbottom').v, 2);
  assert.equal(r.bar.hole, null);           // bracket holes only count on the wall
  assert.ok(!r.rows.some(x => x.id === 'barhole' || x.id === 'gap'));
  // floor: bar bottom at 20, default 2" gap on the wall
  const f = G.compute(tab(BASE, { ref: { floor: { edge: 'bottom', value: 20 } }, bar: { kind: 'wall', h: 3 } }), { mode: 'simple' });
  near(f.m.bottom, 25);
  near(f.bar.m.bottom, 20);
  // centered over the mantle: the gap below sets the gap above
  const c = G.compute(tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'bottom', value: 1.5 } }, bar: { kind: 'wall', place: 'center', h: 3 } }), { mode: 'simple' });
  near(c.m.bottom, 6);
  near(c.bar.gap, 1.5);
  // no bar height yet: nothing to place
  const n = G.compute(tab(BASE, { ref: { floor: { edge: 'bottom', value: 20 } }, bar: { kind: 'wall' } }), { mode: 'simple' });
  assert.equal(n.ok, false);
  assert.ok(n.missing.includes('bar.h'));
  // soundbar off: back to the TV bottom
  near(G.compute(tab(BASE, { ref: { floor: { edge: 'bottom', value: 20 } }, bar: { kind: 'none', h: 3 } }), { mode: 'simple' }).m.bottom, 20);
  const low = G.compute(tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'bottom', value: -1 } }, bar: { kind: 'tv', h: 3.25 } }), { mode: 'simple' });
  assert.ok(low.warnings.some(w => /Soundbar bottom is 1" below the mantle top/.test(G.fill(w, G.formatInches))));
  assert.equal(G.compute(tab(BASE, { bar: { kind: 'none', h: 3 } }), { mode: 'simple' }).bar, null);
  assert.deepEqual(G.compute(tab(BASE, { bar: { kind: 'tv' } }), { mode: 'simple' }).bar.need, ['height']);
});

test('room items are sketch only, placed from the floor and the center line', () => {
  const room = { ceil: 96, mantle: 20, left: 60, right: 40 };
  const r = G.compute(tab(BASE, { ref: { ff: 0.75 }, room }), { mode: 'pro' });
  const it = r.sketch.items.filter(i => i.room);
  near(it.find(i => i.t === 'line' && i.cls === 'ceiling').y0, 95.25);   // 96 from today's floor, 3/4 below the finished floor
  near(it.find(i => i.t === 'dim' && i.name === 'ceiling').v, 96);
  near(it.find(i => i.t === 'dim' && i.name === 'to ceiling').v, 95.25 - 58.375);   // TV top up to the ceiling
  near(it.find(i => i.t === 'label' && i.cls === 'mantle').top, 19.25);
  const walls = it.filter(i => i.cls === 'wall').map(i => i.x0);
  assert.deepEqual(walls, [-60, 40]);
  near(it.find(i => i.t === 'dim' && i.key === 'wall' && i.a < 0).v, 60 - 57.125 / 2);
  near(r.m.hole, G.compute(tab(BASE, { ref: { ff: 0.75 } }), { mode: 'pro' }).m.hole);   // the drill height does not change
  // mantle and ceiling placements already have their own height; no floor known, no heights drawn
  const m = G.compute(tab(BASE, { ref: { kind: 'mantle', mantle: { edge: 'bottom', value: 4 } }, room }), { mode: 'simple' });
  assert.ok(!m.sketch.items.some(i => i.room && i.cls !== 'wall' && i.key !== 'wall'));
  assert.equal(m.sketch.items.filter(i => i.cls === 'wall').length, 2);
});

test('the client sketch leaves out holes, studs and layout marks', () => {
  const job = tab(BASE, {
    mount: { plateW: 26.5, plateH: 10.75 }, studs: { list: [-8, 8] }, box: { on: true, w: 7.5, h: 7.5 },
    center: { mode: 'two', from: 'left', a: 30, b: 90 }, built: { top: 60 },
    bar: { kind: 'wall', w: 45, h: 3.25, gap: 2, holesToTop: 1.5 }
  });
  const r = G.compute(job, { mode: 'pro' });
  const client = r.sketch.items.filter(i => !i.crew), crew = r.sketch.items.filter(i => !i.client);
  const has = (list, f) => list.some(f);
  for (const cls of ['drill', 'stud', 'edge', 'markline', 'center']) assert.ok(!has(client, i => i.t === 'line' && i.cls === cls), cls);
  for (const cls of ['plate', 'box', 'zone', 'built']) assert.ok(!has(client, i => i.t === 'rect' && i.cls === cls), cls);
  assert.ok(!has(client, i => i.t === 'dot' || i.t === 'mark'));
  assert.ok(!has(client, i => i.t === 'dim' && ['hole', 'chain', 'barhole', 'bartop'].includes(i.key)));
  assert.ok(!has(client, i => i.t === 'dim' && i.side === 'bottom'));
  for (const k of ['bottom', 'center', 'top']) assert.ok(has(client, i => i.t === 'dim' && i.key === k), k);
  for (const f of [i => i.cls === 'tv', i => i.cls === 'sbar', i => i.key === 'bargap', i => i.name === 'height', i => i.name === 'width']) assert.ok(has(client, f));
  // the installer still sees everything
  for (const cls of ['drill', 'stud', 'edge', 'center']) assert.ok(has(crew, i => i.t === 'line' && i.cls === cls), cls);
  assert.ok(has(crew, i => i.t === 'dim' && i.key === 'hole') && has(crew, i => i.t === 'dot'));
  // a finished floor: the client reads heights above it, the installer reads the tape from the floor today
  const ff = G.compute(tab(BASE, { ref: { ff: 0.75 } }), { mode: 'pro' }).sketch.items;
  near(ff.find(i => !i.crew && i.t === 'dim' && i.key === 'center').v, 42);
  near(ff.find(i => !i.client && i.t === 'dim' && i.key === 'center').v, 42.75);
  assert.ok(!ff.some(i => !i.crew && i.name === 'finish'));
  // a standard size: the client sees the size, not "estimate"
  const sz = G.compute(tab(BASE, { tv: { src: 'size', size: 65 } }), { mode: 'simple' }).sketch.items.filter(i => i.cls === 'tvname');
  assert.deepEqual(sz.filter(i => !i.crew).map(i => i.lines[0]), ['65″ TV']);
  assert.deepEqual(sz.filter(i => !i.client).map(i => i.lines[0]), ['65″ class (estimate)']);
});

// Past jobs: add entries to jobs.json as
// { "name": "...", "mode": "simple" | "pro", "tab": { ...overrides like BASE... }, "expect": { "hole": 53.875, "top": ..., "center": ..., "bottom": ... } }
// expect values are what you measured from the reference (floor, mantle, or ceiling). Tolerance is 1/32".
const jobsFile = path.join(__dirname, 'jobs.json');
const jobs = fs.existsSync(jobsFile) ? JSON.parse(fs.readFileSync(jobsFile, 'utf8')) : [];
for (const j of jobs) {
  test('past job: ' + j.name, () => {
    const r = G.compute(tab(j.tab), { mode: j.mode || 'simple' });
    for (const [k, v] of Object.entries(j.expect)) {
      const got = k in r.m ? r.m[k] : k.startsWith('aff.') ? r.aff[k.slice(4)] : undefined;
      assert.ok(got != null, `${k} not computed`);
      near(G.parseInches(v), got, `${j.name} ${k}`, 1 / 32);
    }
  });
}

test('blank slide: the arms ride the plate rails, so the plate moves onto the studs', () => {
  const m = { holesToTop: 4.5, plateW: 27, plateH: 12, holeDown: 1.25 };   // rows 9 1/2" apart, mirrored
  let r = G.compute(tab(BASE, { tv: { vesaW: 400, vesaH: 300 }, mount: m, studs: { list: [-13.75, 2.25] } }), { mode: 'pro' });
  assert.ok(r.slide.ok); assert.equal(r.slide.from, 'plate');
  near(r.slide.slide, (27 - 400 / 25.4 - 1.5) / 2);
  near(r.plateX, -1.25);   // lag slots end 1" in from each plate end
  assert.deepEqual(r.slide.hits, [-13.75, 2.25]);
  assert.equal(r.drill.length, 4); assert.ok(r.drill.every(d => d.ok));
  // the lower row gets its own height, in the results and in the sketch
  const low = r.rows.find(x => x.id === 'hole2');
  near(low.v, r.m.hole - 9.5);
  assert.ok(r.sketch.items.some(i => i.t === 'dim' && i.key === 'hole2'));
  // typed 0: the TV can't move, so the holes are drawn hollow on the studs the plate reaches
  r = G.compute(tab(BASE, { tv: { vesaW: 400, vesaH: 300 }, mount: Object.assign({ slide: 0 }, m), studs: { list: [-13.75, 2.25] } }), { mode: 'pro' });
  assert.equal(r.slide.ok, false); assert.equal(r.drill.length, 4); assert.ok(r.drill.every(d => !d.ok));
});
