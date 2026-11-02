/* Road Trip — the cars, the ops that change them, and the math. Plain functions, no DOM. The page (app.js) and the
   API Worker (worker/roadtrip.js) both use this file, so a change shows on the phone the way the Worker will keep it.
   A change to this file reaches the Worker only with `npx wrangler deploy` in worker/.
   Browser: window.Trip. Node and the Worker: require or import './data.js'.

   The cars of one household, which the Worker keeps in KV:
     { cars: [{ id, name, tank, info, notes, archived, fuel: [fill], costs: [cost], reminders: [reminder] }] }
     info      [{ label, value }]   the car's own facts, one box each: plate, VIN, oil, filters, wipers…
     fill      { id, date, odo, gal, price, total, partial, reset }   a fill-up. partial: the tank was not filled.
               reset: a fill-up before this one was not logged, so MPG starts over here.
     cost      { id, date, odo, name, kind, cost, note }   kind is 'service', 'expense' or 'other'; odo can be null.
     reminder  { id, name, miles, months }   due `miles` or `months` after the last cost with the same name.
   A deleted fill-up, cost or reminder stays, with `gone`: the date it was deleted. It shows only under Archived,
   where it can be put back or deleted for good. live() leaves those out.
   Dates are 'YYYY-MM-DD'. Distances are miles, fuel is gallons, and money is dollars.

   A change is an op. The Worker applies a batch of ops to the newest data, so two phones do not undo each other.
     { op: 'car', id, name, tank, info, notes, archived }   add or change a car; with no info, the info stays    { op: 'uncar', id }
     { op: 'fill', car, id, date, odo, gal, price, total, partial, reset }    { op: 'unfill', car, id }
     { op: 'cost', car, id, date, odo, name, kind, cost, note }                { op: 'uncost', car, id }
     { op: 'remind', car, id, name, miles, months }                            { op: 'unremind', car, id }
     { op: 'gone', car, list, id, date }   to Archived          { op: 'back', car, list, id }   out of Archived
   `list` is 'fuel', 'costs' or 'reminders'. The un- ops delete for good.   */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Trip = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Sizes that keep a household small: the Worker reads and writes it whole on each change.
  const MAX = { cars: 20, fuel: 4000, costs: 1500, reminders: 30, ops: 1000, name: 40, note: 1000, notes: 4000, info: 40, label: 30, value: 300 };
  const KINDS = ['service', 'expense', 'other'];
  const LIST = ['fuel', 'costs', 'reminders'];

  /* ---- checks ---- */
  // Text as one tidy line, or null when it is empty or too long.
  function line(s, max) {
    if (typeof s !== 'string') return null;
    const t = s.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return t && t.length <= max ? t : null;
  }
  // Text with line breaks, or '' when it is empty. Too long is null.
  function lines(s, max) {
    if (s == null || s === '') return '';
    if (typeof s !== 'string') return null;
    const t = s.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
      .split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return t.length <= max ? t : null;
  }
  const ID = /^[\w-]{1,40}$/;
  const id = v => typeof v === 'string' && ID.test(v) ? v : null;
  const isDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z')) &&
    new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
  // A number from lo to hi, rounded to `dp` places, or undefined.
  function num(v, lo, hi, dp) {
    if (typeof v !== 'number' || !isFinite(v) || v < lo || v > hi) return undefined;
    const f = 10 ** dp;
    return Math.round(v * f) / f;
  }
  const maybe = (v, lo, hi, dp) => v == null || v === '' ? null : num(v, lo, hi, dp);
  // `gone` on a record that was deleted
  const gone = (o, r) => r && isDate(o.gone) ? { ...r, gone: o.gone } : r;

  // The info boxes, or null when one is wrong. A box needs a value; a box with no label is called Note.
  function checkInfo(a) {
    if (a == null) return [];
    if (!Array.isArray(a) || a.length > MAX.info) return null;
    const out = [];
    for (const x of a) {
      if (!x || typeof x !== 'object') return null;
      const label = x.label == null || x.label === '' ? 'Note' : line(x.label, MAX.label), value = lines(x.value, MAX.value);
      if (!label || !value) return null;
      out.push({ label, value });
    }
    return out;
  }
  function checkCar(o) {
    const name = line(o.name, MAX.name), tank = maybe(o.tank, 0.5, 200, 1), notes = lines(o.notes, MAX.notes), info = checkInfo(o.info);
    if (!id(o.id) || !name || tank === undefined || notes == null || !info) return null;
    return { id: o.id, name, tank, info, notes, archived: o.archived === true };
  }
  // Notes as info boxes: a line "Oil: 0W-20" starts a box, and the lines under it, up to a blank line, go in it too.
  // What is not under a label stays in `rest`. { info, rest }
  function infoFrom(text) {
    const info = [], rest = [];
    let open = null;
    for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
      const l = raw.trim(), m = l.match(/^([^:]{1,30}):\s*(.*)$/);
      if (!l) { open = null; if (rest.length && rest[rest.length - 1] !== '') rest.push(''); continue; }
      if (m && !/^https?$/i.test(m[1].trim())) { open = { label: m[1].trim(), value: m[2] }; info.push(open); }
      else if (open) open.value = open.value ? open.value + '\n' + l : l;
      else rest.push(l);
    }
    return { info: info.filter(x => x.value.trim()).map(x => ({ label: x.label, value: x.value.trim() })), rest: rest.join('\n').trim() };
  }
  function checkFill(o) {
    const odo = num(o.odo, 0, 3e6, 1), gal = num(o.gal, 0.001, 500, 3), price = num(o.price, 0, 100, 3), total = num(o.total, 0, 1e5, 2);
    if (!id(o.id) || !isDate(o.date) || odo === undefined || gal === undefined || price === undefined || total === undefined) return null;
    return gone(o, { id: o.id, date: o.date, odo, gal, price, total, partial: o.partial === true, reset: o.reset === true });
  }
  function checkCost(o) {
    const name = line(o.name, MAX.name), odo = maybe(o.odo, 0, 3e6, 1), cost = maybe(o.cost, 0, 1e7, 2), note = lines(o.note, MAX.note);
    if (!id(o.id) || !isDate(o.date) || !name || odo === undefined || cost === undefined || note == null || !KINDS.includes(o.kind)) return null;
    return gone(o, { id: o.id, date: o.date, odo, name, kind: o.kind, cost: cost || 0, note });
  }
  function checkReminder(o) {
    const name = line(o.name, MAX.name), miles = maybe(o.miles, 1, 1e6, 0), months = maybe(o.months, 1, 240, 0);
    if (!id(o.id) || !name || miles === undefined || months === undefined || (miles == null && months == null)) return null;
    return gone(o, { id: o.id, name, miles, months });
  }

  // One op from a phone, tidied, or null when it is not a valid op.
  function check(op) {
    if (!op || typeof op !== 'object') return null;
    const on = r => r && id(op.car) ? { op: op.op, car: op.car, ...r } : null;
    switch (op.op) {
      case 'car': { const c = checkCar(op); if (c && op.info === undefined) delete c.info; return c && { op: 'car', ...c }; }
      case 'uncar': return id(op.id) ? { op: 'uncar', id: op.id } : null;
      case 'fill': return on(checkFill(op));
      case 'cost': return on(checkCost(op));
      case 'remind': return on(checkReminder(op));
      case 'unfill': case 'uncost': case 'unremind': return id(op.car) && id(op.id) ? { op: op.op, car: op.car, id: op.id } : null;
      case 'gone': return id(op.car) && id(op.id) && LIST.includes(op.list) && isDate(op.date) ? { op: 'gone', car: op.car, list: op.list, id: op.id, date: op.date } : null;
      case 'back': return id(op.car) && id(op.id) && LIST.includes(op.list) ? { op: 'back', car: op.car, list: op.list, id: op.id } : null;
    }
    return null;
  }

  /* ---- the data ---- */
  const arr = a => Array.isArray(a) ? a : [];
  // Unique by id: a later copy wins.
  function uniq(list) {
    const m = new Map();
    for (const x of list) m.set(x.id, x);
    return [...m.values()];
  }
  // The data in the right shape: anything else is dropped. A copy, so the input is not changed.
  function tidy(raw) {
    const cars = arr(raw && raw.cars).map(c => {
      const car = c && typeof c === 'object' && checkCar(c);
      if (!car) return null;
      car.fuel = uniq(arr(c.fuel).map(f => f && checkFill(f)).filter(Boolean)).slice(-MAX.fuel);
      car.costs = uniq(arr(c.costs).map(x => x && checkCost(x)).filter(Boolean)).slice(-MAX.costs);
      car.reminders = uniq(arr(c.reminders).map(r => r && checkReminder(r)).filter(Boolean)).slice(-MAX.reminders);
      return car;
    }).filter(Boolean);
    return { cars: uniq(cars).slice(0, MAX.cars) };
  }
  // A record into a list: it takes the place of the one with its id, or goes at the end while there is room.
  function put(list, rec, max) {
    const i = list.findIndex(x => x.id === rec.id);
    if (i >= 0) list[i] = rec; else if (list.length < max) list.push(rec);
  }
  const strip = op => { const { op: _, car, gone, ...rec } = op; return rec; };
  const LISTS = { fill: ['fuel', MAX.fuel], cost: ['costs', MAX.costs], remind: ['reminders', MAX.reminders] };
  // The data after the ops, which check() made.
  function apply(data, ops) {
    const d = tidy(data);
    const car = cid => d.cars.find(c => c.id === cid);
    for (const op of ops) {
      if (op.op === 'car') {
        const c = car(op.id), { op: _, ...fields } = op;
        if (c) Object.assign(c, fields);
        else if (d.cars.length < MAX.cars) d.cars.push({ info: [], ...fields, fuel: [], costs: [], reminders: [] });
      } else if (op.op === 'uncar') {
        d.cars = d.cars.filter(c => c.id !== op.id);
      } else if (LISTS[op.op]) {
        const c = car(op.car), [list, max] = LISTS[op.op];
        if (c) put(c[list], strip(op), max);
      } else if (op.op === 'gone' || op.op === 'back') {
        const c = car(op.car), rec = c && c[op.list].find(x => x.id === op.id);
        if (rec && op.op === 'gone') rec.gone = op.date;
        if (rec && op.op === 'back') delete rec.gone;
      } else {
        const c = car(op.car), list = { unfill: 'fuel', uncost: 'costs', unremind: 'reminders' }[op.op];
        if (c) c[list] = c[list].filter(x => x.id !== op.id);
      }
    }
    return d;
  }

  // A car without what was deleted, which is in `binned`: [{ list, rec }], the newest deletion first.
  function live(car) {
    const binned = [];
    const keep = list => car[list].filter(x => { if (x.gone) binned.push({ list, rec: x }); return !x.gone; });
    const out = { ...car, fuel: keep('fuel'), costs: keep('costs'), reminders: keep('reminders') };
    out.binned = binned.sort((a, b) => (a.rec.gone < b.rec.gone ? 1 : a.rec.gone > b.rec.gone ? -1 : 0));
    return out;
  }

  /* ---- dates ---- */
  const MS = 864e5;
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const utc = s => Date.parse(s + 'T00:00:00Z');
  const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / MS);
  const addDays = (s, n) => new Date(utc(s) + n * MS).toISOString().slice(0, 10);
  // A date `n` months later, on the last day of the month when the day is past it: Jan 31 + 1 month is Feb 28.
  function addMonths(s, n) {
    const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
  }

  /* ---- fill-ups and MPG ---- */
  // The fill-ups in odometer order, each with what it tells:
  //   trip   miles since the fill-up before it      days   days since it
  //   mpg    for a filled tank: the miles since the last filled tank over the gallons put in since then, the
  //          not-filled ones too. A missed fill-up (reset) starts over, and so does the first fill-up.
  //   miles, used   the miles and gallons behind `mpg`, so a range adds them up instead of averaging MPGs.
  function fills(car) {
    const list = car.fuel.slice().sort((a, b) => a.odo - b.odo || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let base = null, gals = 0, prev = null;
    return list.map(f => {
      const x = { ...f, trip: prev ? f.odo - prev.odo : null, days: prev ? daysBetween(prev.date, f.date) : null, mpg: null, miles: 0, used: 0 };
      if (!prev || f.reset || base == null) {
        gals = 0;
        base = f.partial ? null : f.odo;
      } else {
        gals += f.gal;
        if (!f.partial) {
          const miles = f.odo - base;
          if (miles > 0 && gals > 0) Object.assign(x, { mpg: miles / gals, miles, used: gals });
          base = f.odo;
          gals = 0;
        }
      }
      prev = f;
      return x;
    });
  }
  // The highest odometer logged, and the date it was logged, or null.
  function latest(car) {
    let o = null;
    for (const x of [...car.fuel, ...car.costs]) if (x.odo != null && (!o || x.odo > o.odo)) o = { odo: x.odo, date: x.date };
    return o;
  }

  /* ---- statistics ---- */
  const RANGES = [['all', 'All'], ['2y', '2Y'], ['1y', '1Y'], ['6m', '6M'], ['3m', '3M']];
  const BACK = { '2y': 24, '1y': 12, '6m': 6, '3m': 3 };
  // The first day of a range that ends `today`, or '' for All.
  const since = (range, today) => BACK[range] ? addMonths(today, -BACK[range]) : '';
  const sum = (list, f) => list.reduce((a, x) => a + (f(x) || 0), 0);

  // The numbers of one car over a range. Miles and days run from the first fill-up in the range to the last one.
  //   mpg, miles, days, perDay (miles a day), perTank, fills, spent, gal, price ($/gal), perMile (fuel $ a mile),
  //   costs: { service, expense, other }: the costs of each kind in the range, and from, to: the dates.
  function stats(car, range, today) {
    const from = since(range, today), all = fills(car);
    const fs = all.filter(f => f.date >= from && f.date <= today);
    const full = fs.filter(f => f.mpg != null);
    const used = sum(full, f => f.used), mpg = used ? sum(full, f => f.miles) / used : null;
    const spent = sum(fs, f => f.total), gal = sum(fs, f => f.gal);
    const first = fs[0], last = fs[fs.length - 1], two = fs.length > 1;
    const miles = two ? last.odo - first.odo : 0, days = two ? daysBetween(first.date, last.date) : 0;
    const price = gal ? spent / gal : null;
    const costs = Object.fromEntries(KINDS.map(k => [k, 0]));
    for (const c of car.costs) if (c.date >= from && c.date <= today) costs[c.kind] += c.cost;
    return {
      from: first ? first.date : null, to: last ? last.date : null, fromOdo: first ? first.odo : null, toOdo: last ? last.odo : null,
      mpg, miles, days, perDay: days > 0 ? miles / days : null, perTank: mpg && car.tank ? mpg * car.tank : null,
      fills: fs.length, spent, gal, price, perMile: mpg && price != null ? price / mpg : null, costs
    };
  }

  // A chart's points over a range, oldest first. x is the odometer (miles/week: the Monday of the week).
  //   mpg, price and permile: one point for each fill-up, from the odometer of the one before it to its own.
  //   x0 is where the step starts, the odometer before.
  //   miles: the miles of each week, Monday to Sunday, with the miles between two fill-ups spread over their days.
  const CHARTS = [['mpg', 'MPG'], ['price', '$/gal'], ['permile', '$/mi'], ['miles', 'Miles']];
  function series(car, kind, range, today) {
    const from = since(range, today), all = fills(car);
    if (kind === 'miles') return weeks(all, from, today);
    const out = [];
    for (const f of all) {
      if (f.date < from || f.date > today || f.trip == null) continue;
      const v = kind === 'price' ? f.price : f.mpg == null ? null : kind === 'mpg' ? f.mpg : f.price / f.mpg;
      // MPG covers the miles since the last filled tank, which can be more than one trip.
      if (v != null) out.push({ x0: f.odo - (kind === 'price' ? f.trip : f.miles), x: f.odo, v, date: f.date, id: f.id });
    }
    return out;
  }
  // The Monday of a date's week.
  const monday = s => addDays(s, -((new Date(utc(s)).getUTCDay() + 6) % 7));
  function weeks(all, from, today) {
    const m = new Map();
    const add = (day, v) => { const w = monday(day); m.set(w, (m.get(w) || 0) + v); };
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1], b = all[i], miles = b.odo - a.odo, days = daysBetween(a.date, b.date);
      if (miles <= 0) continue;
      if (days <= 0) { add(b.date, miles); continue; }
      for (let k = 1; k <= days; k++) add(addDays(a.date, k), miles / days);
    }
    const start = from ? monday(from) : '';
    return [...m.keys()].sort().filter(w => w >= start && w <= today).map(w => ({ x: utc(w), v: m.get(w), date: w }));
  }
  // The average of the last `n` points, for the line through a chart.
  function trend(points, n) {
    let s = 0;
    return points.map((p, i) => {
      s += p.v;
      if (i >= n) s -= points[i - n].v;
      return s / Math.min(i + 1, n);
    });
  }

  /* ---- reminders ---- */
  const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  // Miles a day lately: the last 6 months of fill-ups, or all of them when that is too few.
  function pace(car, today) {
    const all = fills(car), recent = all.filter(f => f.date >= addMonths(today, -6));
    for (const fs of [recent, all]) {
      if (fs.length < 2) continue;
      const days = daysBetween(fs[0].date, fs[fs.length - 1].date);
      if (days >= 14) return (fs[fs.length - 1].odo - fs[0].odo) / days;
    }
    return null;
  }
  // The newest cost with this name.
  function lastDone(car, name) {
    let best = null;
    for (const c of car.costs) {
      if (!same(c.name, name)) continue;
      if (!best || c.date > best.date || (c.date === best.date && (c.odo || 0) > (best.odo || 0))) best = c;
    }
    return best;
  }
  // Each reminder with when it is due, the late ones first and then the soonest:
  //   { ...reminder, last: the cost it counts from or null, atOdo, atDate: the odometer and the date it is due,
  //     left: miles to go from the last odometer logged (below 0 when late),
  //     date: when it is due: by the miles at the pace lately, or by the date, whichever is first, late }
  function due(car, today) {
    const now = latest(car), perDay = pace(car, today);
    const order = r => r.date || '9999';
    return car.reminders.map(r => {
      const last = lastDone(car, r.name);
      const atOdo = last && last.odo != null && r.miles ? last.odo + r.miles : null;
      const atDate = last && r.months ? addMonths(last.date, r.months) : null;
      const left = atOdo != null && now ? atOdo - now.odo : null;
      let date = atDate;
      if (left != null && perDay) {
        const byMiles = addDays(now.date, Math.round(left / perDay));
        if (!date || byMiles < date) date = byMiles;
      }
      const late = (left != null && left < 0) || (atDate != null && atDate < today);
      return { ...r, last, atOdo, atDate, left, date, late };
    }).sort((a, b) => (b.late - a.late) || (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
  }

  /* ---- the API Worker (worker/roadtrip.js) ---- */
  const API = '/api/roadtrip';
  // The words for each error code. shared/account.js has the words for the account codes.
  const PROBLEMS = {
    network: 'No connection.',
    signin: 'You are signed out. Sign in again.',
    busy: 'Road Trip is busy. Try again.',
    full: 'Road Trip cannot save right now.',
    body: 'The change is not valid.',
    nobody: 'That account is gone.',
    asked: 'Someone else asked them first.',
    crowd: 'A household has room for 6 people.',
    gone: 'That request is gone.'
  };
  function fail(code) {
    const e = new Error(PROBLEMS[code] || `The server answered with error ${code}.`);
    e.code = code;
    return e;
  }
  // `token` is the dorrance.me sign-in; it goes only in the Authorization header. `fetchFn` is for tests.
  function api(token, fetchFn) {
    const f = fetchFn || ((url, opts) => fetch(url, opts));
    async function call(path, method, body, keepalive) {
      const headers = {};
      if (token) headers.Authorization = 'Bearer ' + token;
      if (body) headers['Content-Type'] = 'application/json';
      let res;
      try { res = await f(API + path, { method, headers, cache: 'no-store', keepalive: !!keepalive, body: body ? JSON.stringify(body) : undefined }); }
      catch (e) { throw fail('network'); }
      if (!res.ok) {
        let code = res.status;
        try { const b = await res.json(); if (b && PROBLEMS[b.error]) code = b.error; } catch (e) {}
        throw fail(code);
      }
      return res.json();
    }
    return {
      get: () => call('', 'GET'),
      // `keepalive` sends even when the page is closing; a browser takes at most 64 KB that way.
      send: (ops, keepalive) => call('', 'POST', { ops }, keepalive),
      people: () => call('/people', 'GET'),
      // 'ask' with a key, 'cancel', 'join', 'decline' or 'leave'
      share: (what, key) => call('/share', 'POST', key ? { do: what, key } : { do: what })
    };
  }

  return { MAX, KINDS, LIST, RANGES, CHARTS, check, tidy, infoFrom, apply, live, iso, daysBetween, addDays, addMonths, fills, latest, since,
    stats, series, trend, pace, due, same, PROBLEMS, fail, api };
});
