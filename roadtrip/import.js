/* Road Trip — bringing the history over from the iOS app Road Trip. Plain functions, no DOM; only the page uses it.
   Browser: window.TripImport (after data.js). Node: require('./import.js').

   Road Trip exports one CSV file per car, in a .zip when there are several. A file starts with a line
   `ROAD TRIP CSV ",."` and has sections, each a title line, a header line and its rows:
     FUEL RECORDS         Odometer (mi), Trip Distance, Date ("2026-8-29 9:44"), Fill Amount, Fill Units, Price per Unit,
                          Total Price, Partial Fill, MPG, Note, …, Reset ("Reset" or empty), …, ID, …
     MAINTENANCE RECORDS  Description, Date, Odometer (mi.), Cost, Note, Location, Type ("Service"), …,
                          Reminder Interval ("6m"), Reminder Distance (5000), …, ID, …
     VEHICLE              Name, …, Notes, Tank Capacity, …
     ROAD TRIPS, TIRE LOG, VALUATIONS   left behind, like the locations and the climate numbers.
   A quoted field can hold commas and line breaks ("" is a quote). The amounts are in gallons and miles.
   A maintenance record with a reminder interval makes a reminder here: the latest one of each name decides.
   The ids come from Road Trip's, so importing the same file again adds nothing. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.TripImport = factory(root.Trip);
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';

  // The rows of a CSV text, each an array of fields.
  function rows(text) {
    const out = [];
    let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c !== '"') f += c;
        else if (text[i + 1] === '"') { f += '"'; i++; }
        else q = false;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); out.push(row); row = []; f = '';
      } else f += c;
    }
    if (f || row.length) { row.push(f); out.push(row); }
    return out;
  }

  // { 'FUEL RECORDS': [{ header: value }], … }
  function sections(text) {
    const out = {};
    let name = null, head = null;
    for (const row of rows(text)) {
      if (row.length === 1 && /^[A-Z][A-Z ]+$/.test(row[0].trim())) { name = row[0].trim(); head = null; out[name] = []; continue; }
      if (!name || row.every(f => f.trim() === '')) continue;
      if (!head) { head = row.map(h => h.trim()); continue; }
      out[name].push(Object.fromEntries(head.map((h, i) => [h, row[i] == null ? '' : row[i]])));
    }
    return out;
  }

  const n = s => { const v = parseFloat(String(s == null ? '' : s).replace(/[$,\s]/g, '')); return isFinite(v) ? v : null; };
  // "2026-8-29 9:44" -> "2026-08-29"
  function day(s) {
    const m = String(s || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return null;
    const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return T.iso(new Date(+m[1], m[2] - 1, +m[3])) === d ? d : null;
  }
  // "6m" -> 6, "1y" -> 12, "2w" -> 1
  function months(s) {
    const m = String(s || '').trim().match(/^(\d+)\s*([dwmy])/i);
    if (!m) return null;
    const k = m[2].toLowerCase(), v = +m[1];
    return Math.max(1, Math.round(k === 'y' ? v * 12 : k === 'm' ? v : k === 'w' ? v / 4.35 : v / 30.4));
  }
  // The value of the first column whose name starts with `start` (the odometer's says (mi) or (mi.)).
  const col = (r, start) => { const k = Object.keys(r).find(h => h.startsWith(start)); return k ? r[k] : ''; };
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  const kindOf = t => /service|repair|mainten/i.test(t) ? 'service' : /expense/i.test(t) ? 'expense' : /\S/.test(t || '') ? 'other' : 'service';

  // One car from one file: { name, tank, notes, fuel, costs, reminders, first, last }, or null when the text is not a
  // Road Trip export. `file` is the file's name, for a car with no name.
  function parse(text, file) {
    text = String(text).replace(/^﻿/, '');
    if (!/^\s*ROAD TRIP CSV/i.test(text)) return null;
    const s = sections(text);
    if (!s['FUEL RECORDS'] && !s['MAINTENANCE RECORDS']) return null;
    const v = (s.VEHICLE || [])[0] || {};
    const name = (v.Name || '').trim() || String(file || 'Car').replace(/\.csv$/i, '').trim() || 'Car';

    const fuel = [];
    for (const r of s['FUEL RECORDS'] || []) {
      const date = day(r.Date), odo = n(col(r, 'Odometer'));
      let gal = n(r['Fill Amount']), price = n(r['Price per Unit']), total = n(r['Total Price']);
      if (gal == null && price && total != null) gal = total / price;
      if (total == null && gal != null && price != null) total = gal * price;
      if (price == null && gal && total != null) price = total / gal;
      if (!date || odo == null || !gal || price == null || total == null) continue;
      fuel.push({ id: 'rt' + (n(r.ID) ?? 'o' + odo), date, odo, gal: +gal.toFixed(3), price: +price.toFixed(3), total: +total.toFixed(2),
        partial: /\S/.test(r['Partial Fill'] || ''), reset: /\S/.test(r.Reset || '') });
    }
    fuel.sort((a, b) => a.odo - b.odo);

    const costs = [], latest = new Map();
    for (const r of s['MAINTENANCE RECORDS'] || []) {
      const date = day(r.Date), what = (r.Description || '').trim();
      if (!date || !what) continue;
      const c = { id: 'rt' + (n(r.ID) ?? 'm' + costs.length), date, odo: n(col(r, 'Odometer')), name: what, kind: kindOf(r.Type),
        cost: n(r.Cost) || 0, note: (r.Note || '').trim().slice(0, T.MAX.note) };
      costs.push(c);
      const key = what.toLowerCase(), was = latest.get(key);
      if (!was || date > was.c.date || (date === was.c.date && (c.odo || 0) >= (was.c.odo || 0))) latest.set(key, { c, r });
    }
    const reminders = [];
    for (const { c, r } of latest.values()) {
      const miles = n(r['Reminder Distance']), every = months(r['Reminder Interval']);
      if (miles || every) reminders.push({ id: 'rt-' + (slug(c.name) || reminders.length), name: c.name, miles: miles || null, months: every });
    }

    const dates = [...fuel, ...costs].map(x => x.date).sort();
    const notes = String(v.Notes || '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    return { name, tank: n(v['Tank Capacity']), notes, fuel, costs, reminders, first: dates[0] || null, last: dates[dates.length - 1] || null };
  }

  // What importing `found` (cars from parse) does to the household's cars (data().raw, with what is in Archived):
  //   [{ name, into, isNew, archived, fuel, costs, reminders, same, ops }]
  // Newest first. A car goes into the car with the same name; a new car with nothing for a year comes in archived. What is there
  // already (the same id, a fill-up at the same odometer, a cost with the same name and date, a reminder with the same
  // name) is counted in `same` and left alone.
  function plan(found, cars, today) {
    const ids = new Set(cars.map(c => c.id)), out = [];
    found = [...found].sort((a, b) => (b.last || '').localeCompare(a.last || ''));   // the cars in use first
    const yearAgo = T.addMonths(today, -12);
    for (const p of found) {
      const have = cars.find(c => T.same(c.name, p.name)) || out.map(o => o.car).find(c => c && T.same(c.name, p.name));
      let id = have ? have.id : 'rt-' + (slug(p.name) || 'car');
      if (!have) { const base = id; for (let i = 2; ids.has(id); i++) id = `${base}-${i}`; ids.add(id); }
      const ops = [];
      const isNew = !have, archived = isNew ? !!p.last && p.last < yearAgo : !!have.archived;
      if (isNew) ops.push({ op: 'car', id, name: p.name.slice(0, T.MAX.name), tank: p.tank, notes: p.notes.slice(0, T.MAX.notes), archived });
      else if ((have.tank == null && p.tank != null) || (!have.notes && p.notes)) {
        ops.push({ op: 'car', id, name: have.name, tank: have.tank ?? p.tank, notes: have.notes || p.notes.slice(0, T.MAX.notes), archived: !!have.archived });
      }
      const was = have || { fuel: [], costs: [], reminders: [] };
      let same = 0, fuel = 0, costs = 0, reminders = 0;
      for (const f of p.fuel) {
        if (was.fuel.some(x => x.id === f.id || x.odo === f.odo)) { same++; continue; }
        ops.push({ op: 'fill', car: id, ...f }); fuel++;
      }
      for (const c of p.costs) {
        if (was.costs.some(x => x.id === c.id || (x.date === c.date && T.same(x.name, c.name)))) { same++; continue; }
        ops.push({ op: 'cost', car: id, ...c }); costs++;
      }
      for (const r of p.reminders) {
        if (was.reminders.some(x => x.id === r.id || T.same(x.name, r.name))) { same++; continue; }
        ops.push({ op: 'remind', car: id, ...r }); reminders++;
      }
      out.push({ name: p.name, into: id, isNew, archived, first: p.first, last: p.last, fuel, costs, reminders, same, ops: ops.filter(T.check),
        car: isNew ? { id, name: p.name, fuel: p.fuel, costs: p.costs, reminders: p.reminders } : null });
    }
    return out.map(({ car, ...o }) => o);
  }

  // The files in a .zip (an ArrayBuffer): [{ name, text }], the CSV files only. Uses the browser's DecompressionStream.
  async function unzip(buf) {
    const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let end = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('not a zip');
    const count = dv.getUint16(end + 10, true), utf8 = new TextDecoder();
    let at = dv.getUint32(end + 16, true);
    const out = [];
    for (let k = 0; k < count && dv.getUint32(at, true) === 0x02014b50; k++) {
      const method = dv.getUint16(at + 10, true), size = dv.getUint32(at + 20, true);
      const nl = dv.getUint16(at + 28, true), xl = dv.getUint16(at + 30, true), cl = dv.getUint16(at + 32, true);
      const local = dv.getUint32(at + 42, true), name = utf8.decode(b.subarray(at + 46, at + 46 + nl));
      at += 46 + nl + xl + cl;
      if (!/\.csv$/i.test(name) || /(^|\/)(__MACOSX|\._)/.test(name)) continue;
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = b.subarray(start, start + size);
      let bytes;
      if (method === 0) bytes = data;
      else if (method === 8) bytes = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else continue;
      out.push({ name: name.split('/').pop(), text: utf8.decode(bytes) });
    }
    return out;
  }

  return { rows, sections, day, months, parse, plan, unzip };
});
