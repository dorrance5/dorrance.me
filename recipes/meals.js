/* Recipes — the meal plan and the grocery list. Plain functions, no DOM. The page (app.js) and the API Worker
   (worker/meals.js) both use this file, so a change shows on the phone the way the Worker will keep it.
   A change to this file reaches the Worker only with `npx wrangler deploy` in worker/.
   Browser: window.Meals. Node and the Worker: require or import './meals.js'.

   The data of one plan, which the Worker keeps in KV. Everyone has a plan, and two people can share one (worker/meals.js):
     { days: { 'YYYY-MM-DD': { recipe, name, by } | { note, by } },
       list: { recipes: [{ id, name }], extra: [{ key, text }], got: [key], gone: [key] } }
   days   the dinner on each day: a recipe, or a note such as "Leftovers". `by` is who planned it.
   list   the recipes on the grocery list, the things added with "Add something else", the items in "Got it", and the
          items of the recipes that Clear took off. An item's key is its name without the amount, in lower case (key()).
   A change is an op. The Worker applies a batch of ops to the newest data, so two phones do not undo each other.
     { op: 'day', date, recipe, name }   plan a recipe     { op: 'add', recipe, name, keys }   a recipe on the list
     { op: 'day', date, note }           plan a note       { op: 'drop', recipe }              a recipe off the list
     { op: 'day', date }                 clear the day     { op: 'extra', text, key }          add something else
     { op: 'got', key, on }              tick an item      { op: 'clear', keys, recipes }      clear "Got it"   */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Meals = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Sizes that keep the data small: a KV value is read and written whole on each change.
  const MAX = { days: 60, recipes: 40, extra: 100, keys: 300, ops: 100, text: 80, name: 120 };
  const KEEP = 14;     // days in the past that the plan keeps
  const AHEAD = 60;    // days ahead that can be planned

  /* ---- checks ---- */
  // Text as one tidy line, or null when it is empty or too long.
  function line(s, max) {
    if (typeof s !== 'string') return null;
    const t = s.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return t && t.length <= max ? t : null;
  }
  const ID = /^[\p{L}\p{N}-]{1,100}$/u;
  const id = v => typeof v === 'string' && ID.test(v) ? v : null;
  const isDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z')) &&
    new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
  const isKey = k => typeof k === 'string' && k.length > 0 && k.length <= MAX.text && k === k.trim();
  const keys = (a, max = MAX.keys) => Array.isArray(a) && a.length <= max && a.every(isKey) ? [...new Set(a)] : null;
  const shift = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

  // One op from a phone, tidied, or null when it is not a valid op.
  function check(op) {
    if (!op || typeof op !== 'object') return null;
    if (op.op === 'day') {
      if (!isDate(op.date)) return null;
      if (op.recipe != null) {
        const r = id(op.recipe), name = line(op.name, MAX.name);
        return r && name ? { op: 'day', date: op.date, recipe: r, name } : null;
      }
      if (op.note != null) {
        const note = line(op.note, MAX.text);
        return note ? { op: 'day', date: op.date, note } : null;
      }
      return { op: 'day', date: op.date };
    }
    if (op.op === 'add') {
      const r = id(op.recipe), name = line(op.name, MAX.name), k = keys(op.keys);
      return r && name && k ? { op: 'add', recipe: r, name, keys: k } : null;
    }
    if (op.op === 'drop') { const r = id(op.recipe); return r ? { op: 'drop', recipe: r } : null; }
    if (op.op === 'extra') {
      const text = line(op.text, MAX.text);
      return text && isKey(op.key) ? { op: 'extra', text, key: op.key } : null;
    }
    if (op.op === 'got') return isKey(op.key) && typeof op.on === 'boolean' ? { op: 'got', key: op.key, on: op.on } : null;
    if (op.op === 'clear') {
      const k = keys(op.keys), rs = Array.isArray(op.recipes) && op.recipes.length <= MAX.recipes && op.recipes.every(id) ? [...op.recipes] : null;
      return k && rs ? { op: 'clear', keys: k, recipes: rs } : null;
    }
    return null;
  }

  /* ---- the data ---- */
  const empty = () => ({ days: {}, list: { recipes: [], extra: [], got: [], gone: [] } });
  // Data in the right shape: anything else is dropped. A copy, so the input is not changed.
  function tidy(raw) {
    const d = empty();
    if (!raw || typeof raw !== 'object') return d;
    const days = raw.days && typeof raw.days === 'object' ? raw.days : {};
    for (const date of Object.keys(days)) {
      const p = days[date], by = p && line(p.by, MAX.name);
      if (!isDate(date) || !by) continue;
      if (id(p.recipe) && line(p.name, MAX.name)) d.days[date] = { recipe: p.recipe, name: line(p.name, MAX.name), by };
      else if (line(p.note, MAX.text)) d.days[date] = { note: line(p.note, MAX.text), by };
    }
    const l = raw.list && typeof raw.list === 'object' ? raw.list : {};
    const arr = a => Array.isArray(a) ? a : [];
    d.list.recipes = arr(l.recipes).filter(r => r && id(r.id) && line(r.name, MAX.name)).map(r => ({ id: r.id, name: line(r.name, MAX.name) }));
    d.list.extra = arr(l.extra).filter(x => x && isKey(x.key) && line(x.text, MAX.text)).map(x => ({ key: x.key, text: line(x.text, MAX.text) }));
    d.list.got = [...new Set(arr(l.got).filter(isKey))];
    d.list.gone = [...new Set(arr(l.gone).filter(isKey))];
    return d;
  }
  // Keeps the data small: old days go, and each list keeps its newest entries.
  function trim(d, today) {
    const from = shift(today, -KEEP), to = shift(today, AHEAD);
    const dates = Object.keys(d.days).filter(x => x >= from && x <= to).sort().slice(-MAX.days);
    d.days = Object.fromEntries(dates.map(x => [x, d.days[x]]));
    const L = d.list;
    L.recipes = L.recipes.slice(-MAX.recipes);
    L.extra = L.extra.slice(-MAX.extra);
    if (!L.recipes.length && !L.extra.length) { L.got = []; L.gone = []; }
    L.got = L.got.slice(-MAX.keys);
    L.gone = L.gone.slice(-MAX.keys);
    return d;
  }
  // The data after the ops, which check() made. `by` is the name of the person who sent them; `today` is the
  // date in UTC, 'YYYY-MM-DD'.
  function apply(data, ops, by, today) {
    const d = tidy(data), L = d.list;
    const without = (a, ks) => a.filter(k => !ks.includes(k));
    for (const op of ops) {
      if (op.op === 'day') {
        if (op.recipe) d.days[op.date] = { recipe: op.recipe, name: op.name, by };
        else if (op.note) d.days[op.date] = { note: op.note, by };
        else delete d.days[op.date];
      } else if (op.op === 'add') {
        if (L.recipes.some(r => r.id === op.recipe)) continue;
        L.recipes.push({ id: op.recipe, name: op.name });
        L.got = without(L.got, op.keys);   // the recipe needs these again
        L.gone = without(L.gone, op.keys);
      } else if (op.op === 'drop') {
        L.recipes = L.recipes.filter(r => r.id !== op.recipe);
      } else if (op.op === 'extra') {
        if (!L.extra.some(x => x.key === op.key)) L.extra.push({ key: op.key, text: op.text });
        L.got = without(L.got, [op.key]);
        L.gone = without(L.gone, [op.key]);
      } else if (op.op === 'got') {
        L.got = without(L.got, [op.key]);
        if (op.on) L.got.push(op.key);
      } else if (op.op === 'clear') {
        L.got = without(L.got, op.keys);
        L.extra = L.extra.filter(x => !op.keys.includes(x.key));
        L.gone = [...without(L.gone, op.keys), ...op.keys];
        L.recipes = L.recipes.filter(r => !op.recipes.includes(r.id));
      }
    }
    return trim(d, today);
  }

  /* ---- the grocery list ---- */
  // An item's key: its name without the amount (data.js amount().what), in lower case, without notes in brackets.
  // "Pulled pork (Costco)" -> "pulled pork". A heading such as "For the sauce:" has no key.
  function key(what) {
    const s = String(what || '').normalize('NFC');
    if (/:\s*$/.test(s)) return '';
    return s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,;.-]+|[\s,;.-]+$/g, '').slice(0, MAX.text).trim();
  }
  // The keys of a recipe's items. `amount` is data.js amount().
  const keysOf = (r, amount) => [...new Set(r.ingredients.map(i => key(amount(i).what)).filter(Boolean))];
  const upper = s => s.charAt(0).toUpperCase() + s.slice(1);
  // The list to show: one line for each item, so "Buns" from two recipes is one line.
  //   [{ key, name, qty: ['1 lb', …], for: [recipe names], extra, got }] in the order the recipes went on the list,
  //   then the things added with "Add something else". `recipes` is the recipe book (data.js forView()).
  function groceries(list, recipes, amount) {
    const book = new Map(recipes.map(r => [r.id, r])), gone = new Set(list.gone), got = new Set(list.got);
    const lines = new Map();
    const at = (k, what) => {
      if (!lines.has(k)) lines.set(k, { key: k, name: upper(what), qty: [], for: [], extra: false });
      return lines.get(k);
    };
    for (const x of list.recipes) {
      const r = book.get(x.id);
      if (!r) continue;
      for (const i of r.ingredients) {
        const a = amount(i), k = key(a.what);
        if (!k || gone.has(k)) continue;
        const l = at(k, a.what);
        if (a.qty) l.qty.push(a.qty);
        if (!l.for.includes(r.name)) l.for.push(r.name);
      }
    }
    for (const x of list.extra) {
      const a = amount(x.text), l = at(x.key, a.what);
      if (a.qty) l.qty.push(a.qty);
      l.extra = true;
    }
    return [...lines.values()].map(l => ({ ...l, got: got.has(l.key) }));
  }
  // The op for Clear: the items in "Got it" come off, and so does each recipe that has no items left.
  function clearing(list, recipes, amount) {
    const ks = groceries(list, recipes, amount).filter(l => l.got).map(l => l.key);
    const gone = new Set([...list.gone, ...ks]), book = new Map(recipes.map(r => [r.id, r]));
    const done = list.recipes.filter(x => { const r = book.get(x.id); return !r || keysOf(r, amount).every(k => gone.has(k)); }).map(x => x.id);
    return { op: 'clear', keys: ks, recipes: done };
  }

  /* ---- weeks, Saturday to Friday, in the phone's time zone ---- */
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // The 7 days of a week: `n` 0 is the week of `now`, 1 is the next one.
  function week(now, n) {
    const today = iso(now), start = now.getDate() + 7 * n - (now.getDay() + 1) % 7;
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(now.getFullYear(), now.getMonth(), start + i), date = iso(x);
      return { date, day: DAY[x.getDay()], long: LONG[x.getDay()], month: MONTH[x.getMonth()], num: x.getDate(), today: date === today, past: date < today };
    });
  }
  // "Oct 19–25", or "Oct 26–Nov 1" across two months
  function span(days) {
    const a = days[0], b = days[days.length - 1];
    return a.month === b.month ? `${a.month} ${a.num}–${b.num}` : `${a.month} ${a.num}–${b.month} ${b.num}`;
  }

  /* ---- the API Worker (worker/meals.js) ---- */
  const API = '/api/meals';
  // The words for each error code. shared/account.js has the words for the account codes.
  const PROBLEMS = {
    network: 'No connection.',
    signin: 'You are signed out. Sign in again.',
    busy: 'The meal plan is busy. Try again.',
    full: 'The meal plan cannot save right now.',
    body: 'The change is not valid.',
    nobody: 'That account is gone.',
    sharing: 'You share your meal plan with someone already. Stop sharing first.',
    asked: 'Someone else asked them first.',
    taken: 'They share a meal plan with someone else now.',
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
      // `keepalive` sends even when the page is closing
      send: (ops, keepalive) => call('', 'POST', { ops }, keepalive),
      people: () => call('/people', 'GET'),
      // 'ask' with a key, 'cancel', 'join', 'decline' or 'leave'
      share: (what, key) => call('/share', 'POST', key ? { do: what, key } : { do: what })
    };
  }

  return { MAX, check, tidy, apply, key, keysOf, groceries, clearing, week, span, iso, PROBLEMS, fail, api };
});
