/* Road Trip — the screen. data.js (window.Trip) has the data, the ops and the math, and the API Worker
   (worker/roadtrip.js) keeps the cars of each household. The dorrance.me sign-in is shared/account.js (window.Account).
   This phone keeps the Worker's last answer and the changes that are not sent yet under "roadtrip", so the screens
   show at once and work with no connection; it shows the answer with those changes on top. */
(function () {
  'use strict';
  const { esc, uid, sheet, closeSheet, toast, themeSegHTML, homeLinkHTML } = App;
  const T = window.Trip, A = window.Account;
  const byId = id => document.getElementById(id);
  App.init({ aurora: false });

  const KEY = 'roadtrip', UIKEY = 'roadtrip.ui';
  // Per-phone conveniences: the tab, the car, the range and chart of Stats, the filter of Expenses, and whether the
  // decimal point goes in by itself (autoDec).
  const ui = Object.assign({ tab: 'stats', car: null, range: 'all', chart: 'mpg', kind: 'all', autoDec: true }, App.load(UIKEY, {}));
  const saveUI = () => App.save(UIKEY, ui);
  const today = () => T.iso(new Date());
  const session = () => A.session();

  /* ---------- words and numbers ---------- */
  const nf = (v, dp) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const mi = v => nf(Math.round(v), 0);
  const money = v => '$' + nf(v, 2);
  const dollars = v => v >= 1000 ? '$' + nf(Math.round(v), 0) : money(v);   // in the small tiles
  const cents = v => '$' + nf(v, 3);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = s => s.split('-').map(Number);
  const dShort = s => { const [, m, d] = parts(s); return `${MON[m - 1]} ${d}`; };
  const dLong = s => { const [y, m, d] = parts(s); return `${MON[m - 1]} ${d}, ${y}`; };
  const dMonth = s => { const [y, m] = parts(s); return `${MON[m - 1]} ${y}`; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  function ago(s) {
    const n = T.daysBetween(s, today());
    if (n <= 0) return n < 0 ? 'Ahead' : 'Today';
    if (n === 1) return 'Yesterday';
    if (n < 14) return `${n} days ago`;
    if (n < 60) return `${Math.floor(n / 7)} weeks ago`;
    if (n < 730) return `${Math.floor(n / 30.44)} months ago`;
    return `${Math.floor(n / 365.25)} years ago`;
  }
  const KIND = { service: 'Service', expense: 'Expense', other: 'Other' };
  const HUES = ['blue', 'teal', 'purple', 'orange', 'green', 'magenta', 'yellow', 'lime'];

  const ICON = {
    car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11l1.6-4.3A2 2 0 0 1 8.5 5.4h7a2 2 0 0 1 1.9 1.3L19 11"/><path d="M3.5 17v-4a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v4z"/><g fill="currentColor" stroke="none"><rect x="4.4" y="16.6" width="4.4" height="3.8" rx="1.3"/><rect x="15.2" y="16.6" width="4.4" height="3.8" rx="1.3"/><circle cx="7.6" cy="14" r="1.6"/><circle cx="16.4" cy="14" r="1.6"/></g></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.2a4.6 4.6 0 0 1 4.5 4.6"/></svg>',
    import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    tick: '<svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'
  };

  /* ---------- the cars: the Worker's answer and the changes on their way ---------- */
  // { name: who signed in, state: the Worker's answer { people, cars, share }, queue: [ops] }
  let store = null, view = null;
  const mine = () => !!(store && session() && store.name === session().name);
  // The answer with the changes on their way on top, each car without what was deleted (data.js live()). `raw` has
  // the cars as they are kept. Worked out once after each change.
  function data() {
    if (!mine()) return null;
    if (!view) { const raw = T.apply(store.state, store.queue).cars; view = { ...store.state, raw, cars: raw.map(T.live) }; }
    return view;
  }
  function save() {
    view = null;
    if (store) { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { note('This phone is out of room. Your last change may not be kept.'); } }
  }
  function readStore() {
    const s = session();
    let c = null;
    try { c = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!s || !c || c.name !== s.name || !c.state || typeof c.state !== 'object' || !Array.isArray(c.queue)) { localStorage.removeItem(KEY); return; }
    store = { name: c.name, state: c.state, queue: c.queue.map(T.check).filter(Boolean) };
  }
  function dropStore() {
    store = null; view = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
    clearTimeout(sendT); clearTimeout(retryT);
    sendT = retryT = tries = 0;
    note('');
  }
  function note(msg) { const n = byId('syncNote'); n.hidden = !msg; n.textContent = msg; }

  // Changes: they show at once and go to the Worker in the next batch.
  function change(...ops) {
    const list = ops.map(T.check);
    if (!mine() || list.some(o => !o)) return false;
    store.queue.push(...list);
    save();
    render();
    later();
    return true;
  }
  let sending = false, sendT = 0, retryT = 0, tries = 0, lastSent = -Infinity, ticks = 0, lastPost = 0, pulls = 0;
  const tripApi = () => T.api(session() && session().token);
  function later() {
    if (sendT || retryT || sending || !mine() || !store.queue.length) return;
    sendT = setTimeout(() => { sendT = 0; send(); }, Math.max(0, lastSent + 1200 - performance.now()));
  }
  function retryNow() { if (retryT) { clearTimeout(retryT); retryT = 0; } later(); }
  // `keepalive` sends while the page closes; a browser takes at most 64 KB that way.
  async function send(keepalive) {
    if (sending || !mine() || !store.queue.length) return;
    const was = store, batch = was.queue.slice(0, T.MAX.ops);
    if (keepalive && JSON.stringify(batch).length > 60000) keepalive = false;
    sending = true;
    lastSent = performance.now();
    let wait = 0;
    try {
      const out = await tripApi().send(batch, keepalive);
      if (store !== was) return;
      was.queue.splice(0, batch.length);
      was.state = out;
      lastPost = ++ticks;
      tries = 0;
      note('');
      save();
      render();
    } catch (e) {
      if (store !== was) return;
      if (e.code === 'busy') wait = 1500;   // another phone saved in the same second
      else if (e.code === 'body') { was.queue.splice(0, batch.length); save(); pull(); }   // drop it: the Worker's copy is right
      else if (e.code === 'signin') signedOut();
      else {   // no connection, the day's free writes are used up, or the Worker failed: keep the changes and try later
        if (!e.code) console.error(e);
        wait = e.code === 'full' ? 300e3 : [5e3, 15e3, 30e3, 60e3][Math.min(tries++, 3)];
        note(`${e.code ? e.message : 'Something went wrong.'} Your changes are kept on this phone and sent later.`);
      }
    } finally {
      sending = false;
      if (store === was) {
        if (wait) retryT = setTimeout(() => { retryT = 0; send(); }, wait);
        else later();   // changes made while this batch was on its way
      }
    }
  }
  // The newest copy. A POST that ends after this GET was sent answers with newer data, so then the GET's is dropped.
  async function pull() {
    const s = session();
    if (!s) return;
    const n = ++pulls, at = ++ticks;
    try {
      const out = await tripApi().get();
      const now = session();
      if (n !== pulls || !now || now.name !== s.name || lastPost > at) return;
      if (mine()) store.state = out; else store = { name: s.name, state: out, queue: [] };
      save();
      render();
      later();
    } catch (e) {
      if (n !== pulls) return;
      if (e.code === 'signin') signedOut();
      else if (!mine()) render();   // no copy on this phone yet: say so
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (!mine()) return;
    if (document.visibilityState === 'hidden') {
      if (store.queue.length && !sending) { clearTimeout(sendT); sendT = 0; send(true); }
    } else { retryNow(); pull(); }
  });
  addEventListener('online', () => { if (mine()) retryNow(); });

  /* ---------- the car on screen ---------- */
  const cars = () => (data() || { cars: [] }).cars;
  function current() {
    const all = cars();
    return all.find(c => c.id === ui.car) || all.find(c => !c.archived) || null;
  }
  const hueOf = car => HUES[Math.max(0, cars().findIndex(c => c.id === car.id)) % HUES.length];
  const lateCount = car => T.due(car, today()).filter(d => d.late).length;

  /* ---------- the screens ---------- */
  function render() {
    const s = session(), d = data(), car = d && current();
    const signedIn = !!s;
    byId('carBtn').hidden = !d || !cars().length;
    byId('whoChev').hidden = !d || !cars().length;
    byId('tabbar').hidden = !signedIn;
    byId('title').textContent = car ? car.name : 'Road Trip';
    byId('addBtn').hidden = !car || ui.tab === 'more';
    for (const b of document.querySelectorAll('#tabbar [data-tab]')) b.classList.toggle('on', b.dataset.tab === ui.tab);
    const late = car ? lateCount(car) : 0, invite = d && d.share && d.share.invite;
    byId('askBadge').hidden = !invite;
    byId('lateBadge').hidden = !late;
    byId('lateBadge').textContent = late;
    let show = 'v-signin';
    if (signedIn && !d) show = 'v-empty';
    else if (signedIn && (car || ui.tab === 'more')) show = 'v-' + ui.tab;
    else if (signedIn) show = 'v-empty';
    for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== show;
    if (show === 'v-stats') drawStats(car);
    if (show === 'v-fuel') drawFuel(car);
    if (show === 'v-costs') drawCosts(car);
    if (show === 'v-more') drawMore(car);
    if (show === 'v-empty') drawEmpty(!!d);
    if (show === 'v-signin') drawSignIn();
    if (openFill) drawFill();
  }
  function goTab(t) {
    if (ui.tab === t) { byId('main').scrollTo({ top: 0, behavior: 'smooth' }); return; }
    ui.tab = t;
    saveUI();
    render();
    byId('main').scrollTop = 0;
    if (t === 'more') loadPeople();
  }
  byId('tabbar').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) goTab(b.dataset.tab); });

  function drawEmpty(loaded) {
    const invite = loaded && data().share && data().share.invite;
    byId('v-empty').innerHTML = loaded
      ? `<div class="empty"><h2>No cars yet</h2>Add a car to log its fill-ups, or bring over your history from the Road Trip app.
          <div class="stack"><button class="primary" type="button" data-act="newcar">Add a car</button><button class="btn" type="button" data-act="import">Import from Road Trip</button></div>
          ${invite ? `<p class="say"><b>${esc(invite.name)}</b> asked to share their cars with you. You can say yes under More.</p>` : ''}</div>`
      : `<div class="empty">Getting your cars…</div>`;
  }

  /* ---- Stats ---- */
  const CH = {
    mpg: { hue: 'blue', show: v => nf(v, 2) + ' MPG', axis: v => nf(v, 1), avg: 'average' },
    price: { hue: 'yellow', show: v => cents(v) + '/gal', axis: v => '$' + nf(v, 2), avg: 'average' },
    permile: { hue: 'green', show: v => cents(v) + '/mi', axis: v => '$' + nf(v, 3), avg: 'average' },
    miles: { hue: 'purple', show: v => mi(v) + ' mi', axis: v => mi(v), avg: 'a week on average' }
  };
  let chart = null;   // what the chart shows: { points, xs, ys, kind, avg }
  function drawStats(car) {
    const st = T.stats(car, ui.range, today());
    const seg = (list, on, attr) => list.map(([k, l]) => `<button type="button" data-${attr}="${k}" class="${k === on ? 'on' : ''}">${l}</button>`).join('');
    const fact = (k, v, s) => `<div class="fact"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    const dash = '—';
    let html = `<div class="seg range" role="group" aria-label="Range">${seg(T.RANGES, ui.range, 'range')}</div>`;
    html += `<section class="card chart c-${CH[ui.chart].hue}"><div class="seg" role="group" aria-label="Chart">${seg(T.CHARTS, ui.chart, 'chart')}</div>
      <div class="ch-read" id="chRead"></div><svg class="ch" id="ch" role="img"></svg><div class="ch-x" id="chX"></div></section>`;
    html += st.mpg
      ? `<div class="hero"><div class="k">Miles per gallon</div><div class="v">${nf(st.mpg, 2)}<small>MPG</small></div><div class="s">${mi(st.miles)} mi · ${dMonth(st.from)} to ${dMonth(st.to)}</div></div>`
      : `<div class="hero empty"><div class="k">Miles per gallon</div><div class="v">${dash}</div><div class="s">${st.fills ? 'Two filled tanks in a row show the MPG.' : 'No fill-ups in this range.'}</div></div>`;
    html += `<div class="tri">${fact('Miles a day', st.perDay != null ? nf(st.perDay, 1) : dash)}${fact('Miles a tank', st.perTank ? mi(st.perTank) : dash, car.tank ? '' : 'Tank size in More')}${fact('Fill-ups', nf(st.fills, 0))}</div>`;
    html += `<div class="tri">${fact('Fuel', dollars(st.spent))}${fact('Per gallon', st.price != null ? cents(st.price) : dash)}${fact('Gallons', nf(Math.round(st.gal), 0))}</div>`;
    // What the car cost: fuel, then each kind of expense that has any, then the total.
    const per = (v, by) => by ? money(v / by) : dash;
    const rows = [['Fuel', 'fuel', st.spent, st.perMile]];
    for (const k of T.KINDS) if (st.costs[k]) rows.push([KIND[k], k, st.costs[k], st.miles ? st.costs[k] / st.miles : null]);
    const total = rows.reduce((a, r) => a + r[2], 0), totalMile = rows.every(r => r[3] != null) ? rows.reduce((a, r) => a + r[3], 0) : null;
    const cell = (cls, v) => `<div class="${cls}">${v}</div>`;
    html += `<section class="card costs"><div class="ct">${cell('h', 'Cost')}${cell('h', 'Spent')}${cell('h', 'A day')}${cell('h', 'A mile')}`;
    for (const [label, k, v, m] of rows) html += cell('k-' + k, label) + cell('', money(v)) + cell('', per(v, st.days)) + cell('', m != null ? cents(m) : dash);
    html += cell('last', 'Total') + cell('last', money(total)) + cell('last', per(total, st.days)) + cell('last', totalMile != null ? cents(totalMile) : dash);
    html += `</div></section>`;
    byId('v-stats').innerHTML = html;
    drawChart(car, st);
  }
  byId('v-stats').addEventListener('click', e => {
    const r = e.target.closest('[data-range]'), c = e.target.closest('[data-chart]');
    if (r) { ui.range = r.dataset.range; saveUI(); render(); }
    if (c) { ui.chart = c.dataset.chart; saveUI(); render(); }
  });

  // The chart: one step for each fill-up, from the odometer of the one before it to its own, or a bar for each week.
  // A line shows the average of the last 8; the dashed line is the average over the range.
  function drawChart(car, st) {
    const svg = byId('ch'), kind = ui.chart, c = CH[kind];
    const points = T.series(car, kind, ui.range, today());
    const W = Math.round(svg.getBoundingClientRect().width) || 360, H = 180, L = 14, R = W - 50, top = 12, bot = H - 12;
    if (points.length < 2) {
      chart = null;
      svg.outerHTML = `<div class="ch-none" id="ch">${kind === 'miles' ? 'Two fill-ups show the miles.' : 'A few filled tanks in a row show this chart.'}</div>`;
      byId('chRead').innerHTML = byId('chX').innerHTML = '';
      return;
    }
    const vs = points.map(p => p.v), bars = kind === 'miles';
    let lo = bars ? 0 : Math.min(...vs), hi = Math.max(...vs);
    if (hi === lo) { hi += 1; lo = bars ? 0 : lo - 1; }
    const pad = (hi - lo) * 0.08;
    hi += pad; if (!bars) lo -= pad;
    const avg = kind === 'mpg' ? st.mpg : kind === 'price' ? st.price : kind === 'permile' ? st.perMile : vs.reduce((a, v) => a + v, 0) / vs.length;
    const sy = v => bot - (v - lo) / (hi - lo) * (bot - top);
    const f1 = v => Math.round(v * 10) / 10;
    let marks = '', xs, ys = points.map(p => sy(p.v));
    if (bars) {
      const bw = (R - L) / points.length, gap = bw >= 5 ? 2 : bw >= 2.5 ? 0.6 : 0;
      xs = points.map((p, i) => L + bw * (i + 0.5));
      marks = points.map((p, i) => `<rect class="bar" x="${f1(L + bw * i + gap / 2)}" y="${f1(sy(p.v))}" width="${f1(Math.max(0.8, bw - gap))}" height="${f1(Math.max(0, bot - sy(p.v)))}" rx="${bw >= 6 ? 2 : 0}"/>`).join('');
    } else {
      const x0 = points[0].x0, x1 = points[points.length - 1].x, sx = x => L + (x - x0) / ((x1 - x0) || 1) * (R - L);
      xs = points.map(p => (sx(p.x0) + sx(p.x)) / 2);
      // Runs of fill-ups that follow each other; a missed fill-up leaves a gap.
      let area = '', line = '';
      points.forEach((p, i) => {
        const a = f1(sx(p.x0)), b = f1(sx(p.x)), y = f1(sy(p.v)), joined = i > 0 && points[i - 1].x === p.x0;
        if (!joined) {
          if (i) area += `L${f1(sx(points[i - 1].x))} ${bot}Z`;
          area += `M${a} ${bot}V${y}`; line += `M${a} ${y}`;
        } else { area += `V${y}`; line += `V${y}`; }
        area += `H${b}`; line += `H${b}`;
      });
      area += `L${f1(sx(x1))} ${bot}Z`;
      marks = `<path class="area" d="${area}"/><path class="top${points.length > 60 ? ' dense' : ''}" d="${line}"/>`;
    }
    // The moving average, run by run: it does not reach across a missed fill-up.
    let trend = '', run = [];
    const flush = () => { T.trend(run.map(i => points[i]), 8).forEach((v, k) => { trend += `${k ? 'L' : 'M'}${f1(xs[run[k]])} ${f1(sy(v))}`; }); run = []; };
    points.forEach((p, i) => { if (!bars && i && points[i - 1].x !== p.x0) flush(); run.push(i); });
    flush();
    marks += `<path class="trend" d="${trend}"/>`;
    const ya = sy(avg);
    let labels = `<text x="${R + 6}" y="${f1(ya + 4)}">${esc(c.axis(avg))}</text>`;
    if (ya - top > 16) labels += `<text x="${R + 6}" y="${top + 4}">${esc(c.axis(hi))}</text>`;
    if (bot - ya > 16) labels += `<text x="${R + 6}" y="${bot}">${esc(c.axis(lo))}</text>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('aria-label', `${T.CHARTS.find(x => x[0] === kind)[1]} chart: ${c.show(avg)} ${c.avg}`);
    svg.innerHTML = `<line class="base" x1="${L}" x2="${R}" y1="${bot}" y2="${bot}"/>${marks}<line class="avg" x1="${L}" x2="${R}" y1="${f1(ya)}" y2="${f1(ya)}"/>${labels}<g id="chHover"></g>`;
    chart = { points, xs, ys, kind, avg, bot };
    readout(-1);
    const first = points[0], last = points[points.length - 1];
    byId('chX').innerHTML = bars
      ? `<span>Week of ${dLong(first.date)}</span><span>Week of ${dLong(last.date)}</span>`
      : `<span>${dLong(fillDate(car, points, 0))}<br>${mi(first.x0)} mi</span><span>${dLong(last.date)}<br>${mi(last.x)} mi</span>`;
  }
  // The date of the fill-up a step starts from.
  const fillDate = (car, points, i) => (T.fills(car).find(f => f.odo === points[i].x0) || points[i]).date;
  function readout(i) {
    if (!chart) return;
    const c = CH[chart.kind], hover = byId('chHover');
    if (i < 0) {
      byId('chRead').innerHTML = `<b>${esc(c.show(chart.avg))}</b><span>${c.avg}</span>`;
      hover.innerHTML = '';
      return;
    }
    const p = chart.points[i], x = Math.round(chart.xs[i] * 10) / 10, y = Math.round(chart.ys[i] * 10) / 10;
    const when = chart.kind === 'miles' ? `Week of ${dShort(p.date)}` : dLong(p.date);
    byId('chRead').innerHTML = `<b>${esc(c.show(p.v))}</b><span>${when}</span>`;
    hover.innerHTML = `<line class="cross" x1="${x}" x2="${x}" y1="8" y2="${chart.bot}"/><circle class="dot" cx="${x}" cy="${y}" r="5"/>`;
  }
  // Touch or point at the chart to read one fill-up or week. A sideways drag reads along it; up and down scrolls.
  let readT = 0;
  function nearest(e) {
    const svg = byId('ch'), box = svg.getBoundingClientRect(), W = Number(svg.getAttribute('viewBox').split(' ')[2]);
    const x = (e.clientX - box.left) * W / box.width;
    let best = 0;
    chart.xs.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(chart.xs[best] - x)) best = i; });
    return best;
  }
  byId('v-stats').addEventListener('pointermove', e => { if (chart && e.target.closest('#ch')) { clearTimeout(readT); readout(nearest(e)); } });
  byId('v-stats').addEventListener('pointerdown', e => { if (chart && e.target.closest('#ch')) { clearTimeout(readT); readout(nearest(e)); } });
  const unread = () => { clearTimeout(readT); readT = setTimeout(() => readout(-1), 1600); };
  byId('v-stats').addEventListener('pointerup', unread);
  byId('v-stats').addEventListener('pointerleave', unread);
  byId('v-stats').addEventListener('pointercancel', unread);
  let resizeT = 0;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (ui.tab === 'stats') render(); }, 150); });

  /* ---- Fuel ---- */
  function drawFuel(car) {
    const list = T.fills(car).reverse();
    if (!list.length) {
      byId('v-fuel').innerHTML = `<div class="empty">No fill-ups yet.<div class="stack"><button class="primary" type="button" data-act="addfill">Add fuel</button></div></div>`;
      return;
    }
    let html = '', year = null;
    for (const f of list) {
      const y = f.date.slice(0, 4);
      if (y !== year) { html += `${year ? '</section>' : ''}<div class="yr">${y}</div><section class="card rows">`; year = y; }
      const right = f.reset ? '<span class="tag reset">Reset</span><small>Missed one</small>'
        : f.partial ? '<span class="tag">Not filled</span>'
        : f.mpg != null ? `<b class="mpg">${nf(f.mpg, 2)} MPG</b><small>${cents(f.price / f.mpg)}/mi</small>` : '<small>First fill-up</small>';
      html += `<button class="row" type="button" data-fill="${esc(f.id)}">
        <span><b>${dShort(f.date)}</b><small>${f.trip != null ? mi(f.trip) + ' mi trip' : 'Start'}</small><small>${mi(f.odo)} mi</small></span>
        <span><span>${cents(f.price)}/gal</span><small>${nf(f.gal, 3)} gal</small></span>
        <span class="r">${right}<small>${money(f.total)}</small></span></button>`;
    }
    byId('v-fuel').innerHTML = html + '</section>';
  }
  byId('v-fuel').addEventListener('click', e => { const r = e.target.closest('[data-fill]'); if (r) showFill(r.dataset.fill); });

  // One fill-up, over the screen, with arrows to the ones before and after it.
  let openFill = null;
  function showFill(id) { openFill = id; drawFill(); }
  function closeFill() { openFill = null; byId('fillLayer')?.remove(); }
  function drawFill() {
    const car = current(), all = car ? T.fills(car) : [], i = all.findIndex(f => f.id === openFill);
    if (i < 0) { closeFill(); return; }
    const f = all[i], prev = all[i - 1], next = all[i + 1];
    let layer = byId('fillLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'layer';
      layer.id = 'fillLayer';
      layer.innerHTML = `<header><button class="round" type="button" data-back aria-label="Back">${ICON.back}</button><span class="sp"></span><button class="round pill" type="button" data-edit>Edit</button></header><main></main>`;
      layer.addEventListener('click', e => {
        if (e.target.closest('[data-back]')) closeFill();
        else if (e.target.closest('[data-edit]')) { const c = current(), x = c && c.fuel.find(y => y.id === openFill); if (x) fillSheet(c, x); }
        else { const b = e.target.closest('[data-go]'); if (b && !b.disabled) { openFill = b.dataset.go; drawFill(); } }
      });
      document.body.appendChild(layer);
    }
    const fact = (k, v) => `<div class="fact"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    const gap = (a, b) => `${plural(T.daysBetween(a.date, b.date), 'day')}<br>${mi(b.odo - a.odo)} mi`;
    const top = f.mpg != null ? `${nf(f.mpg, 2)}<small>MPG</small>` : f.reset ? 'Missed fill-up' : f.partial ? 'Not filled' : 'First fill-up';
    const why = f.mpg != null ? '' : f.reset ? 'MPG starts over here: a fill-up before this one was not logged.'
      : f.partial ? 'The MPG shows at the next filled tank.' : 'The MPG shows from the next filled tank.';
    let html = `<div class="hero"><div class="k">Fuel · ${dLong(f.date)}</div><div class="v">${top}</div><div class="s">${why || ago(f.date)}</div></div>`;
    html += `<div class="tri">${fact('Total', money(f.total))}${fact('Per gallon', cents(f.price))}${fact('Gallons', nf(f.gal, 3))}</div>`;
    html += `<div class="tri">${fact('Trip', f.trip != null ? mi(f.trip) + ' mi' : '—')}${fact('Per mile', f.mpg ? cents(f.price / f.mpg) : '—')}${fact('Per tank', f.mpg && car.tank ? mi(f.mpg * car.tank) + ' mi' : '—')}</div>`;
    html += `<div class="nb"><button type="button" data-go="${prev ? esc(prev.id) : ''}"${prev ? '' : ' disabled'} aria-label="Fill-up before">${ICON.left}<span>${prev ? gap(prev, f) : 'First'}</span></button>`
      + `<button type="button" data-go="${next ? esc(next.id) : ''}"${next ? '' : ' disabled'} aria-label="Fill-up after">${ICON.right}<span>${next ? gap(f, next) : 'Newest'}</span></button></div>`;
    // MPG of the fill-ups around it, this one in blue.
    const near = all.slice(Math.max(0, i - 3), i + 4), mpgs = near.map(x => x.mpg).filter(v => v != null);
    if (mpgs.length > 1) {
      const lo = Math.min(...mpgs) * 0.9, hi = Math.max(...mpgs), w = 100 / near.length;
      const bars = near.map((x, k) => {
        if (x.mpg == null) return '';
        const h = 12 + (x.mpg - lo) / ((hi - lo) || 1) * 66, on = x.id === f.id ? ' on' : '';
        return `<rect class="b${on}" x="${(k * w + w * 0.18).toFixed(1)}%" y="${(86 - h).toFixed(1)}" width="${(w * 0.64).toFixed(1)}%" height="${h.toFixed(1)}" rx="4"/>`
          + `<text class="${on.trim()}" x="${(k * w + w / 2).toFixed(1)}%" y="104">${nf(x.mpg, 1)}</text>`;
      }).join('');
      html += `<section class="card mini"><svg role="img" aria-label="MPG of the fill-ups around this one">${bars}</svg></section>`;
    }
    const li = (k, v, s) => `<div class="li"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    const lastOdo = (T.latest(car) || { odo: f.odo }).odo;
    html += `<section class="card list">${li('Date', dLong(f.date), ago(f.date))}${li('Odometer', mi(f.odo) + ' mi', lastOdo > f.odo ? `${mi(lastOdo - f.odo)} mi ago` : 'The newest reading')}`;
    if (f.trip != null) html += li('Trip', `${mi(f.trip)} mi, ${plural(f.days, 'day')}`, f.days > 0 ? `${nf(f.trip / f.days, 1)} mi a day` : '');
    html += `</section>`;
    layer.querySelector('main').innerHTML = html;
  }

  /* ---- Expenses ---- */
  function remWords(d) {
    const t = today(), every = [d.miles && `${mi(d.miles)} mi`, d.months && plural(d.months, 'month')].filter(Boolean).join(' or ');
    if (!d.last) return { cls: 'ok', st: 'Not logged yet', sub: `Every ${every}. Log a ${d.name.toLowerCase()} to start it.` };
    let st, cls = '';
    const at = [d.atOdo != null && `${mi(d.atOdo)} mi`, d.atDate && dLong(d.atDate)].filter(Boolean).join(' or ');
    // With months only, the first line has the date already.
    const when = d.atOdo == null ? `Every ${every} · last ${dLong(d.last.date)}` : null;
    if (d.late) {
      cls = 'late';
      st = d.left != null && d.left < 0 ? `Past due by ${mi(-d.left)} mi` : `Past due since ${dLong(d.atDate)}`;
      return { cls, st, sub: when || `Was due at ${at}` };
    }
    if (d.date && d.date <= t) st = 'Due about now, going by your miles a day';
    else {
      st = d.left != null ? `Due in ${mi(d.left)} mi` : `Due ${dLong(d.atDate)}`;
      if (d.date && d.left != null) st += ` · about ${dShort(d.date)}`;
      if (d.date && T.daysBetween(t, d.date) > 45) cls = 'ok';
    }
    return { cls, st, sub: when || `Due at ${at}` };
  }
  function drawCosts(car) {
    const dues = T.due(car, today());
    let html = `<section class="card sec hue-orange"><div class="sec-h"><span class="ic orange">${ICON.bell}</span>Reminders<button class="add" type="button" data-act="addrem">Add</button></div><div class="sec-b">`;
    html += dues.length ? dues.map(d => {
      const w = remWords(d);
      return `<button class="rem ${w.cls}" type="button" data-rem="${esc(d.id)}"><span class="t"><b>${esc(d.name)}</b><span class="st">${esc(w.st)}</span><small>${esc(w.sub)}</small></span>${ICON.chev}</button>`;
    }).join('') : '<p class="none">Add one for oil changes, filters, or anything that comes due by miles or months.</p>';
    html += `</div></section>`;
    const kinds = [['all', 'All'], ...T.KINDS.map(k => [k, KIND[k]])];
    html += `<div class="seg filter" role="group" aria-label="Show">${kinds.map(([k, l]) => `<button type="button" data-kind="${k}" class="${k === ui.kind ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const list = car.costs.filter(c => ui.kind === 'all' || c.kind === ui.kind)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.odo || 0) - (a.odo || 0)));
    if (!list.length) html += `<div class="empty">${ui.kind === 'all' ? 'No expenses yet.' : `No ${KIND[ui.kind].toLowerCase()} yet.`}<div class="stack"><button class="primary" type="button" data-act="addcost">Add an expense</button></div></div>`;
    let year = null;
    for (const c of list) {
      const y = c.date.slice(0, 4);
      if (y !== year) {
        const sumY = list.filter(x => x.date.startsWith(y)).reduce((a, x) => a + x.cost, 0);
        html += `${year ? '</section>' : ''}<div class="yr">${y}${sumY ? ' · ' + money(sumY) : ''}</div><section class="card rows">`;
        year = y;
      }
      html += `<button class="row two" type="button" data-cost="${esc(c.id)}"><span><b>${esc(c.name)}</b><small>${dShort(c.date)}${c.odo != null ? ' · ' + mi(c.odo) + ' mi' : ''}${c.note ? ' · ' + esc(c.note.split('\n')[0]) : ''}</small></span>
        <span class="r"><span>${c.cost ? money(c.cost) : '—'}</span><small><span class="tag ${c.kind}">${KIND[c.kind]}</span></small></span></button>`;
    }
    byId('v-costs').innerHTML = html + (year ? '</section>' : '');
  }
  byId('v-costs').addEventListener('click', e => {
    const car = current();
    if (!car) return;
    const k = e.target.closest('[data-kind]'), c = e.target.closest('[data-cost]'), r = e.target.closest('[data-rem]');
    if (k) { ui.kind = k.dataset.kind; saveUI(); render(); }
    else if (c) { const x = car.costs.find(y => y.id === c.dataset.cost); if (x) costSheet(car, x); }
    else if (r) { const x = car.reminders.find(y => y.id === r.dataset.rem); if (x) remSheet(car, x); }
  });

  /* ---- More ---- */
  let people = null, sharing = false, armed = null;   // people who can be asked; an ask, a yes or a stop on its way
  async function loadPeople() {
    if (!session()) return;
    try { people = (await tripApi().people()).people; if (ui.tab === 'more') render(); } catch (e) {}
  }
  function drawMore(car) {
    const d = data(), s = session();
    let html = '';
    if (car) {
      html += `<section class="card sec hue-blue"><div class="sec-h"><span class="ic blue">${ICON.car}</span>Car${car.archived ? ' <span class="tag">Archived</span>' : ''}</div><div class="sec-b">
        <div class="grid2"><label class="fld"><span class="fk">Name</span><input class="fv" id="mName" value="${esc(car.name)}" maxlength="40" autocapitalize="words"></label>
        <label class="fld"><span class="fk">Tank size, gal</span><input class="fv" id="mTank" value="${car.tank != null ? car.tank : ''}" inputmode="decimal" placeholder="14.8"></label></div>
        <label class="fld wide"><span class="fk">Notes</span><textarea id="mNotes" rows="6" placeholder="Plate, VIN, oil type, filter numbers, wiper sizes…">${esc(car.notes)}</textarea></label>
        <div class="actions"><button class="btn" type="button" data-act="archive">${car.archived ? 'Put the car back' : 'Archive the car'}</button></div>
        </div></section>`;
    }
    html += archivedRow();
    html += `<section class="card sec hue-purple"><div class="sec-h"><span class="ic purple">${ICON.people}</span>Household</div><div class="sec-b">${household(d)}</div></section>`;
    html += `<section class="card sec hue-teal"><div class="sec-h"><span class="ic teal">${ICON.import}</span>Import from Road Trip</div><div class="sec-b">
      <ol class="steps"><li>In Road Trip, export as CSV and save the .zip to Files.</li><li>Pick the .zip here. Each car comes over with its fill-ups, services and reminders.</li><li>Cars with nothing logged for a year go under Archived.</li></ol>
      <button class="btn" type="button" data-act="import" style="width:100%">Choose the Road Trip file</button></div></section>`;
    html += `<section class="card sec"><div class="sec-h"><span class="ic gray">${ICON.gear}</span>Settings</div><div class="sec-b">${themeSegHTML()}
      <div class="label">Typing numbers</div>${switchHTML('mAuto', ui.autoDec, 'Automatic decimal', 'Type 8821 for 8.821 gallons, and 4239 for $4.239. Like the Road Trip app.')}
      <div class="label">Account</div><div class="person"><span class="av">${esc(s.name.charAt(0).toUpperCase())}</span><span class="t">${esc(s.name)}<small>Signed in on this phone</small></span><button class="btn" type="button" data-act="signout">Sign out</button></div></div></section>`;
    html += homeLinkHTML();
    byId('v-more').innerHTML = html;
  }
  function household(d) {
    if (!d) return '<p class="none">Getting your household…</p>';
    const sh = d.share || {}, off = sharing ? ' disabled' : '', others = sh.with || [];
    const av = n => `<span class="av">${esc(n.charAt(0).toUpperCase())}</span>`;
    let html = '';
    if (sh.invite) {
      const n = esc(sh.invite.name);
      html += `<div class="box"><div class="person">${av(sh.invite.name)}<span class="t">${n} asked to share cars<small>${others.length ? 'You leave the household you share now, and its cars stay there.' : 'Your cars come along.'}</small></span></div>
        <div class="two"><button class="primary" type="button" data-share="join"${off}>Join</button><button class="btn" type="button" data-share="decline"${off}>No thanks</button></div></div>`;
    }
    html += `<p class="say">${others.length ? `<b>${esc(d.people.join(', ').replace(/, ([^,]*)$/, ' and $1'))}</b> share these cars. A change on one phone shows on the others.` : 'Share your cars with the people you live with. Everyone sees the same fill-ups, expenses and reminders.'}</p>`;
    if (others.length) html += others.map(p => `<div class="person">${av(p.name)}<span class="t">${esc(p.name)}<small>Shares your cars</small></span></div>`).join('');
    if (sh.asked) html += `<div class="person">${av(sh.asked.name)}<span class="t">${esc(sh.asked.name)}<small>Waiting for ${esc(sh.asked.name)} to say yes</small></span><button class="btn" type="button" data-share="cancel"${off}>Cancel</button></div>`;
    else {
      const can = (people || []).filter(p => !others.some(o => o.key === p.key) && !(sh.invite && sh.invite.key === p.key));
      html += `<div class="label">Ask someone to share</div>` + (people == null ? '<p class="none">Getting the list…</p>'
        : can.length ? `<div class="ask">${can.map(p => `<button class="chip" type="button" data-ask="${esc(p.key)}"${off}>${esc(p.name)}</button>`).join('')}</div>`
        : '<p class="none">No one else has an account yet.</p>');
    }
    if (others.length) html += `<div class="actions" style="margin-top:12px"><button class="btn${armed === 'leave' ? ' armed' : ''}" type="button" data-share="leave"${off}>${armed === 'leave' ? 'Tap again to stop' : 'Stop sharing'}</button></div><p class="hint">The others keep the cars, and you keep a copy.</p>`;
    return html;
  }
  async function doShare(what, key) {
    if (sharing || !mine()) return;
    if (store.queue.length) { toast('Your last changes are on their way. Try again in a moment.'); retryNow(); return; }
    sharing = true;
    render();
    try {
      const out = await tripApi().share(what, key);
      if (mine()) { store.state = out; lastPost = ++ticks; save(); }
      const said = { ask: 'Asked. They say yes in Road Trip, under More.', cancel: 'Ask taken back.', join: 'You share cars now.', decline: 'Said no.', leave: 'You stopped sharing.' };
      toast(said[what]);
    } catch (e) {
      if (e.code === 'signin') signedOut();
      else toast(e.message);
    } finally { sharing = false; render(); }
  }
  // Two taps for a step that cannot be undone: the first arms the button for 3 seconds.
  let armT = 0;
  function arm(what) {
    if (armed === what) { armed = null; clearTimeout(armT); return true; }
    armed = what;
    clearTimeout(armT);
    armT = setTimeout(() => { armed = null; render(); }, 3000);
    render();
    return false;
  }
  byId('v-more').addEventListener('click', e => {
    const car = current(), t = e.target.closest('[data-theme]');
    if (t) { App.setTheme(t.dataset.theme); return; }
    const sh = e.target.closest('[data-share]'), ask = e.target.closest('[data-ask]');
    if (sh) { if (sh.dataset.share !== 'leave' || arm('leave')) doShare(sh.dataset.share); return; }
    if (ask) { doShare('ask', ask.dataset.ask); return; }
    if (e.target.closest('#mAuto')) { ui.autoDec = !ui.autoDec; saveUI(); render(); return; }
    const act = e.target.closest('[data-act]');
    if (!act || !car) return;
    if (act.dataset.act === 'archive') {
      change({ op: 'car', ...carFields(car), archived: !car.archived });
      if (!car.archived) { const next = cars().find(c => !c.archived); if (next) { ui.car = next.id; saveUI(); render(); } }
      toast(car.archived ? `${car.name} is back.` : `${car.name} is under Archived now.`);
    }
  });
  const carFields = c => ({ id: c.id, name: c.name, tank: c.tank, notes: c.notes, archived: c.archived });
  // The car's name, tank and notes save when a field is left.
  byId('v-more').addEventListener('change', e => {
    const car = current();
    if (!car || !['mName', 'mTank', 'mNotes'].includes(e.target.id)) return;
    const name = byId('mName').value.trim() || car.name, tankText = byId('mTank').value.trim(), tank = tankText ? parseFloat(tankText) : null;
    if (tankText && !(tank > 0 && tank <= 200)) { toast('Type the tank size in gallons, like 14.8.'); return; }
    if (!change({ op: 'car', ...carFields(car), name, tank, notes: byId('mNotes').value })) toast('That is too long to keep.');
  });

  /* ---- sign in ---- */
  let making = false;
  function drawSignIn() {
    byId('aTitle').textContent = making ? 'Ask for an account' : 'Sign in';
    byId('aPass').autocomplete = making ? 'new-password' : 'current-password';
    byId('aPass').placeholder = making ? 'Password, 8 characters or more' : 'Password';
    byId('aGo').textContent = making ? 'Ask for an account' : 'Sign in';
    byId('aSwap').textContent = making ? 'I have an account' : 'New here? Ask for an account';
  }
  function result(msg, ok) { const r = byId('aResult'); r.hidden = !msg; r.textContent = msg || ''; r.classList.toggle('ok', !!ok); }
  byId('aSwap').addEventListener('click', () => { making = !making; result(''); drawSignIn(); });
  byId('aForm').addEventListener('submit', async e => {
    e.preventDefault();
    const go = byId('aGo');
    if (go.disabled) return;
    const name = byId('aName').value.trim().replace(/\s+/g, ' '), pw = byId('aPass').value;
    if (!name) { result('Type your name.'); byId('aName').focus(); return; }
    if (!pw) { result('Type your password.'); byId('aPass').focus(); return; }
    if (making && pw.length < 8) { result(A.fail('password').message); return; }
    go.disabled = true;
    go.textContent = making ? 'Asking…' : 'Signing in…';
    result('');
    try {
      if (making) {
        const out = await A.api().signup(name, pw);
        making = false;
        byId('aPass').value = '';
        result(`Thanks, ${out.name}. Your account is waiting for ${out.admin}. You can sign in once it’s approved.`, true);
      } else {
        const out = await A.signIn(name, pw);
        byId('aPass').value = '';
        toast(`Signed in as ${out.name}.`);
        readStore();
        render();
        pull();
      }
    } catch (err) {
      result(err.code ? err.message : 'Something went wrong. Try again.');
    } finally {
      go.disabled = false;
      drawSignIn();
    }
  });
  // A sign-in that ended on the Worker: forget it here too.
  function signedOut() { A.keep(null); dropStore(); closeFill(); closeSheet(); render(); }

  /* ---------- the sheets: add and change ---------- */
  const num = v => { const n = parseFloat(String(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : null; };
  // Automatic decimal: the digits fill in from the right, as on a register. 8821 is 8.821 with 3 places.
  function shift(el, dp) {
    const digits = el.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
    el.value = digits ? (Number(digits) / 10 ** dp).toFixed(dp) : '';
  }
  // A field for money or gallons: with automatic decimal, a keypad without the point.
  const pad = () => ui.autoDec ? 'inputmode="numeric" pattern="[0-9]*"' : 'inputmode="decimal"';
  // A number the sheet put in itself starts over at the first key, and the digits always go on the end.
  function autoShift(box, id, dp, after) {
    const el = box.querySelector('#' + id);
    const toEnd = () => { if (ui.autoDec) setTimeout(() => el.setSelectionRange(el.value.length, el.value.length)); };
    el.addEventListener('focus', toEnd);
    el.addEventListener('click', toEnd);
    const typedIn = () => { el.classList.remove('auto'); if (ui.autoDec) shift(el, dp); after && after(); };
    el.addEventListener('beforeinput', e => {
      if (!ui.autoDec || !el.classList.contains('auto')) return;
      e.preventDefault();
      el.value = (e.data || '').replace(/\D/g, '');
      typedIn();
    });
    el.addEventListener('input', typedIn);
  }
  const fld = (id, label, attrs = '', cls = '') => `<label class="fld ${cls}"><span class="fk">${label}</span><input class="fv" id="${id}" ${attrs}></label>`;
  const switchHTML = (id, on, title, sub) => `<button class="switch" type="button" role="switch" id="${id}" aria-checked="${on}"><span class="t"><b>${title}</b><small>${sub}</small></span><span class="k"></span></button>`;
  function wireSwitch(box, id) { const s = box.querySelector('#' + id); s.addEventListener('click', () => s.setAttribute('aria-checked', s.getAttribute('aria-checked') !== 'true')); return () => s.getAttribute('aria-checked') === 'true'; }
  function wireSeg(box, sel) {
    const seg = box.querySelector(sel);
    seg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
    return () => seg.querySelector('.on').dataset.v;
  }
  // Delete: it goes to Archived, with a moment to take it back there too.
  function delButton(box, onDelete) { box.querySelector('[data-del]')?.addEventListener('click', onDelete); }
  function bin(car, list, id, what) {
    change({ op: 'gone', car: car.id, list, id, date: today() });
    closeSheet();
    undo(`${what} moved to Archived`, () => change({ op: 'back', car: car.id, list, id }));
  }

  // Fuel: any two of gallons, $/gallon and total, and the third works itself out.
  function fillSheet(car, f) {
    const all = T.fills(car), last = all[all.length - 1];
    const box = sheet(`<h2>${f ? 'Edit fuel' : 'Add fuel'}</h2>
      <div class="grid2">${fld('fDate', 'Date', `type="date" value="${f ? f.date : today()}" max="${T.addDays(today(), 1)}"`)}${fld('fOdo', 'Odometer', `inputmode="decimal" value="${f ? f.odo : ''}" placeholder="${last ? mi(last.odo) : ''}"`)}</div>
      <div class="grid3">${fld('fGal', 'Gallons', `${pad()} value="${f ? f.gal.toFixed(3) : ''}"`)}${fld('fPrice', '$/gallon', `${pad()} value="${f ? f.price.toFixed(3) : ''}" placeholder="${last ? last.price.toFixed(3) : ''}"`)}${fld('fTotal', 'Total $', `${pad()} value="${f ? f.total.toFixed(2) : ''}"`)}</div>
      <p class="hint" id="fHint">Fill in two of the three, and the third works itself out.</p>
      <div class="seg" id="fFull"><button type="button" data-v="full" class="${f && f.partial ? '' : 'on'}">Filled tank</button><button type="button" data-v="part" class="${f && f.partial ? 'on' : ''}">Not filled</button></div>
      ${switchHTML('fReset', !!(f && f.reset), 'Missed a fill-up before this', 'MPG starts over here, so the fuel that was not logged does not count.')}
      <div class="actions">${f ? '<button class="danger" type="button" data-del>Delete</button>' : ''}<button class="primary" type="button" id="fSave">Save</button></div>`);
    const $f = id => box.querySelector('#' + id);
    const full = wireSeg(box, '#fFull'), reset = wireSwitch(box, 'fReset');
    // The two fields typed last decide the third.
    let typed = f ? ['fGal', 'fTotal'] : [];
    const F3 = ['fGal', 'fPrice', 'fTotal'];
    function work() {
      // What the sheet put in itself (class auto) goes, and is worked out again.
      F3.forEach(id => { const el = $f(id); if (el.classList.contains('auto')) { el.value = ''; el.classList.remove('auto'); } });
      const v = id => num($f(id).value), put = (id, val) => { $f(id).value = val; $f(id).classList.add('auto'); };
      const have = typed.filter(id => v(id) != null).slice(-2);
      // With only gallons or the total, the price there counts, or else the last price fills in.
      if (have.length === 1 && have[0] !== 'fPrice' && (v('fPrice') != null || last)) {
        if (v('fPrice') == null) put('fPrice', last.price.toFixed(3));
        have.push('fPrice');
      }
      if (have.length < 2) return hint();
      const out = F3.find(id => !have.includes(id)), price = v('fPrice');
      let val = null;
      if (out === 'fTotal') val = v('fGal') * price;
      if (out === 'fGal' && price) val = v('fTotal') / price;
      if (out === 'fPrice' && v('fGal')) val = v('fTotal') / v('fGal');
      if (val != null && isFinite(val)) put(out, out === 'fTotal' ? val.toFixed(2) : val.toFixed(3));
      hint();
    }
    // The trip and the MPG as the numbers go in.
    function hint() {
      const odo = num($f('fOdo').value), gal = num($f('fGal').value), h = $f('fHint');
      const before = all.filter(x => x.id !== (f && f.id) && odo != null && x.odo < odo).pop();
      if (odo == null || !before) { h.textContent = 'Fill in two of the three, and the third works itself out.'; return; }
      let t = `${mi(odo - before.odo)} mi since ${dShort(before.date)}`;
      if (gal && full() === 'full' && !reset() && !before.reset && !before.partial && before.mpg !== undefined) t += ` · about ${nf((odo - before.odo) / gal, 1)} MPG`;
      h.textContent = t + '.';
    }
    F3.forEach(id => autoShift(box, id, id === 'fTotal' ? 2 : 3, () => { typed = typed.filter(x => x !== id).concat(id); work(); }));
    $f('fOdo').addEventListener('input', hint);
    box.querySelector('#fFull').addEventListener('click', hint);
    hint();
    delButton(box, () => {
      bin(car, 'fuel', f.id, 'Fill-up');
      if (openFill === f.id) closeFill();
    });
    $f('fSave').addEventListener('click', () => {
      work();
      const date = $f('fDate').value, odo = num($f('fOdo').value), gal = num($f('fGal').value), price = num($f('fPrice').value), total = num($f('fTotal').value);
      if (!date) return toast('Pick the date.');
      if (odo == null || odo <= 0) { $f('fOdo').focus(); return toast('Type the odometer.'); }
      if (!gal || price == null || total == null) return toast('Fill in two of gallons, $/gallon and total.');
      const rec = { id: f ? f.id : uid(), date, odo, gal, price, total, partial: full() === 'part', reset: reset() };
      if (!change({ op: 'fill', car: car.id, ...rec })) return toast('Check the numbers.');
      closeSheet();
      if (!f) toast('Fuel added.');
    });
    if (!f) setTimeout(() => $f('fOdo').focus(), 250);
  }

  // The names used before, newest first, to tap instead of typing.
  function names(car, extra = []) {
    const seen = new Map();
    for (const c of car.costs.slice().sort((a, b) => (a.date < b.date ? 1 : -1))) if (!seen.has(c.name.toLowerCase())) seen.set(c.name.toLowerCase(), c.name);
    for (const n of extra) if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
    return [...seen.values()].slice(0, 10);
  }
  const chips = list => list.length ? `<div class="chips" id="nameChips">${list.map(n => `<button class="chip" type="button" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : '';
  function wireChips(box, input, after) {
    box.querySelector('#nameChips')?.addEventListener('click', e => { const b = e.target.closest('[data-name]'); if (b) { input.value = b.dataset.name; after && after(); } });
  }

  function costSheet(car, c, preset) {
    const last = T.latest(car), p = preset || {};
    const box = sheet(`<h2>${c ? 'Edit expense' : 'Add expense'}</h2>
      ${fld('cName', 'What', `value="${esc(c ? c.name : p.name || '')}" maxlength="40" autocapitalize="sentences" placeholder="Oil change"`, 'wide')}
      ${chips(c ? [] : names(car, ['Oil change', 'Tire rotation', 'Air filter', 'Registration']))}
      <div class="grid2">${fld('cDate', 'Date', `type="date" value="${c ? c.date : today()}"`)}${fld('cOdo', 'Odometer', `inputmode="decimal" value="${c && c.odo != null ? c.odo : ''}" placeholder="Optional"`)}</div>
      ${fld('cCost', 'Cost $', `${pad()} value="${c && c.cost ? c.cost.toFixed(2) : ''}" placeholder="0.00"`, 'wide')}
      <div class="seg" id="cKind">${T.KINDS.map(k => `<button type="button" data-v="${k}" class="${(c ? c.kind : 'service') === k ? 'on' : ''}">${KIND[k]}</button>`).join('')}</div>
      <label class="fld wide"><span class="fk">Note</span><textarea id="cNote" rows="2" placeholder="Parts, shop, anything to remember">${esc(c ? c.note : '')}</textarea></label>
      <p class="hint" id="cHint" hidden></p>
      <div class="actions">${c ? '<button class="danger" type="button" data-del>Delete</button>' : ''}<button class="primary" type="button" id="cSave">Save</button></div>`);
    const $c = id => box.querySelector('#' + id), kind = wireSeg(box, '#cKind');
    // A reminder with this name counts from here.
    function hint() {
      const r = car.reminders.find(x => T.same(x.name, $c('cName').value || ' ')), h = $c('cHint');
      h.hidden = !r;
      if (!r) return;
      const odo = num($c('cOdo').value), date = $c('cDate').value;
      const at = [r.miles && odo != null && `${mi(odo + r.miles)} mi`, r.months && date && dLong(T.addMonths(date, r.months))].filter(Boolean).join(' or ');
      h.textContent = `The ${r.name.toLowerCase()} reminder counts from this one${at ? `: next at ${at}` : ''}.`;
    }
    ['cName', 'cOdo', 'cDate'].forEach(id => $c(id).addEventListener('input', hint));
    autoShift(box, 'cCost', 2);
    wireChips(box, $c('cName'), hint);
    hint();
    delButton(box, () => bin(car, 'costs', c.id, 'Expense'));
    $c('cSave').addEventListener('click', () => {
      const name = $c('cName').value.trim(), date = $c('cDate').value, odoText = $c('cOdo').value.trim(), costText = $c('cCost').value.trim();
      if (!name) { $c('cName').focus(); return toast('Type what it was.'); }
      if (!date) return toast('Pick the date.');
      const odo = odoText ? num(odoText) : null, cost = costText ? num(costText) : 0;
      if (odoText && odo == null) return toast('Check the odometer.');
      if (cost == null) return toast('Check the cost.');
      const rec = { id: c ? c.id : uid(), date, odo, name, kind: kind(), cost, note: $c('cNote').value };
      if (!change({ op: 'cost', car: car.id, ...rec })) return toast('Check the fields.');
      closeSheet();
      if (!c) toast('Expense added.');
    });
    if (!c && !p.name) setTimeout(() => $c('cName').focus(), 250);
  }

  function remSheet(car, r) {
    const box = sheet(`<h2>${r ? 'Reminder' : 'Add a reminder'}</h2>
      ${fld('rName', 'What', `value="${esc(r ? r.name : '')}" maxlength="40" autocapitalize="sentences" placeholder="Oil change"`, 'wide')}
      ${chips(r ? [] : names(car, ['Oil change', 'Tire rotation', 'Air filter', 'Cabin air filter']))}
      <div class="grid2">${fld('rMiles', 'Every … miles', `inputmode="numeric" value="${r && r.miles ? r.miles : ''}" placeholder="5,000"`)}${fld('rMonths', 'Or every … months', `inputmode="numeric" value="${r && r.months ? r.months : ''}" placeholder="6"`)}</div>
      <p class="hint" id="rHint"></p>
      <div class="actions">${r ? '<button class="danger" type="button" data-del>Delete</button><button class="btn" type="button" id="rLog">Log it</button>' : ''}<button class="primary" type="button" id="rSave">Save</button></div>`);
    const $r = id => box.querySelector('#' + id);
    function hint() {
      const name = $r('rName').value.trim(), done = name && car.costs.filter(c => T.same(c.name, name)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      $r('rHint').textContent = !name ? 'It counts from the last expense with the same name.'
        : done ? `Counts from the last ${name.toLowerCase()}: ${dLong(done.date)}${done.odo != null ? ` at ${mi(done.odo)} mi` : ''}.`
        : `No ${name.toLowerCase()} logged yet. It starts once you log one.`;
    }
    $r('rName').addEventListener('input', hint);
    wireChips(box, $r('rName'), hint);
    hint();
    delButton(box, () => bin(car, 'reminders', r.id, 'Reminder'));
    $r('rLog')?.addEventListener('click', () => costSheet(car, null, { name: r.name }));
    $r('rSave').addEventListener('click', () => {
      const name = $r('rName').value.trim(), m = $r('rMiles').value.trim(), mo = $r('rMonths').value.trim();
      const miles = m ? Math.round(num(m)) : null, months = mo ? Math.round(num(mo)) : null;
      if (!name) { $r('rName').focus(); return toast('Type what it is for.'); }
      if (!miles && !months) return toast('Type the miles, the months, or both.');
      if (!change({ op: 'remind', car: car.id, id: r ? r.id : uid(), name, miles, months })) return toast('Check the numbers.');
      closeSheet();
    });
    if (!r) setTimeout(() => $r('rName').focus(), 250);
  }

  // The list of cars, from the header.
  function carsSheet() {
    const all = cars(), cur = current(), t = today();
    const row = c => {
      const st = T.stats(c, 'all', t), late = lateCount(c), h = hueOf(c);
      const sub = [st.mpg ? nf(st.mpg, 2) + ' MPG' : null, st.miles ? mi(st.miles) + ' mi' : null].filter(Boolean).join(' · ') || 'No fill-ups yet';
      return `<button class="car" type="button" data-car="${esc(c.id)}"><span class="ic ${h}" style="color:var(--${h});background:var(--${h}-bg)">${ICON.car}</span><span class="t"><b>${esc(c.name)}</b><small>${sub}</small></span>${late ? `<span class="badge">${late}</span>` : ''}${cur && cur.id === c.id ? ICON.tick : ''}</button>`;
    };
    const live = all.filter(c => !c.archived || (cur && cur.id === c.id));
    const box = sheet(`<h2>Cars</h2><div class="card cars">${live.map(row).join('') || '<p class="none">No cars yet.</p>'}</div>
      ${archivedRow()}<button class="btn" type="button" id="newCar" style="width:100%">Add a car</button>`);
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-car]');
      if (b) { ui.car = b.dataset.car; saveUI(); closeSheet(); closeFill(); render(); byId('main').scrollTop = 0; }
      if (e.target.closest('[data-act="archived"]')) archivedSheet();
    });
    box.querySelector('#newCar').addEventListener('click', newCarSheet);
  }
  function newCarSheet() {
    const box = sheet(`<h2>Add a car</h2>
      <div class="grid2">${fld('nName', 'Name', 'maxlength="40" autocapitalize="words" placeholder="Pilot"')}${fld('nTank', 'Tank size, gal', 'inputmode="decimal" placeholder="14.8"')}</div>
      <p class="hint">The name can be anything: the model, or what you call it.</p>
      <div class="actions"><button class="primary" type="button" id="nSave">Add the car</button></div>`);
    const $n = id => box.querySelector('#' + id);
    $n('nSave').addEventListener('click', () => {
      const name = $n('nName').value.trim(), tankText = $n('nTank').value.trim(), tank = tankText ? num(tankText) : null;
      if (!name) { $n('nName').focus(); return toast('Type a name.'); }
      if (tankText && !(tank > 0 && tank <= 200)) return toast('Type the tank size in gallons, like 14.8.');
      const id = uid();
      if (!change({ op: 'car', id, name, tank, notes: '', archived: false })) return toast('Check the name.');
      ui.car = id;
      saveUI();
      closeSheet();
      render();
    });
    setTimeout(() => $n('nName').focus(), 250);
  }

  // Archived: the archived cars, and what was deleted from each car, to put back or delete for good.
  function archivedCount() {
    const d = data();
    return d ? d.cars.reduce((n, c) => n + (c.archived ? 1 : 0) + c.binned.length, 0) : 0;
  }
  const archivedRow = () => `<button class="card menu" type="button" data-act="archived"><span class="ic gray">${ICON.box}</span><span class="t">Archived</span><span class="n">${archivedCount() || ''}</span>${ICON.chev}</button>`;
  const LISTWORD = { fuel: 'Fuel', costs: 'Expense', reminders: 'Reminder' };
  function archivedSheet() {
    const all = cars(), old = all.filter(c => c.archived), t = today();
    const buttons = key => `<span class="two"><button class="btn" type="button" data-back="${key}">Put back</button><button class="danger" type="button" data-forget="${key}">Delete</button></span>`;
    const what = ({ list, rec }) => list === 'fuel'
      ? [`Fuel · ${dLong(rec.date)}`, `${nf(rec.gal, 3)} gal · ${money(rec.total)}`]
      : list === 'costs' ? [rec.name, `${dLong(rec.date)}${rec.cost ? ' · ' + money(rec.cost) : ''}`]
      : [rec.name, 'Reminder · ' + [rec.miles && `${mi(rec.miles)} mi`, rec.months && plural(rec.months, 'month')].filter(Boolean).join(' or ')];
    let html = `<h2>Archived</h2><p class="say">Archived cars, and the fill-ups, expenses and reminders you delete, wait here until you put them back or delete them for good.</p>`;
    if (old.length) {
      html += `<div class="label">Cars</div><div class="card cars">${old.map(c => {
        const st = T.stats(c, 'all', t), sub = [st.mpg ? nf(st.mpg, 2) + ' MPG' : null, st.miles ? mi(st.miles) + ' mi' : null].filter(Boolean).join(' · ') || 'No fill-ups';
        return `<div class="arow"><span class="t"><b>${esc(c.name)}</b><small>${sub}</small></span>${buttons('car:' + esc(c.id))}</div>`;
      }).join('')}</div>`;
    }
    for (const c of all.filter(x => x.binned.length)) {
      html += `<div class="label">Deleted from ${esc(c.name)}</div><div class="card cars">${c.binned.map(b => {
        const [title, sub] = what(b);
        return `<div class="arow"><span class="t"><b>${esc(title)}</b><small>${esc(sub)}</small><small>Deleted ${dShort(b.rec.gone)}</small></span>${buttons(`${b.list}:${esc(c.id)}:${esc(b.rec.id)}`)}</div>`;
      }).join('')}</div>`;
    }
    if (!old.length && !all.some(x => x.binned.length)) html += '<p class="none">Nothing here.</p>';
    const box = sheet(html);
    box.addEventListener('click', e => {
      const back = e.target.closest('[data-back]'), forget = e.target.closest('[data-forget]');
      const key = (back || forget)?.dataset[back ? 'back' : 'forget'];
      if (!key) return;
      const [list, cid, rid] = key.split(':');
      if (forget && !forget.classList.contains('armed')) {   // two taps
        forget.classList.add('armed');
        forget.textContent = 'Sure?';
        setTimeout(() => { if (forget.isConnected) { forget.classList.remove('armed'); forget.textContent = 'Delete'; } }, 3000);
        return;
      }
      if (list === 'car') {
        const c = cars().find(x => x.id === cid);
        if (!c) return;
        if (back) { change({ op: 'car', ...carFields(c), archived: false }); toast(`${c.name} is back.`); }
        else { change({ op: 'uncar', id: cid }); if (ui.car === cid) { ui.car = null; saveUI(); render(); } toast(`${c.name} is deleted.`); }
      } else if (back) { change({ op: 'back', car: cid, list, id: rid }); toast(`${LISTWORD[list]} is back.`); }
      else change({ op: { fuel: 'unfill', costs: 'uncost', reminders: 'unremind' }[list], car: cid, id: rid });
      if (archivedCount()) archivedSheet(); else closeSheet();
    });
  }

  /* ---- Import from Road Trip (import.js) ---- */
  // A .zip of Road Trip's CSV files, or the CSV files themselves.
  byId('importFile').addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length || !data()) return;
    const found = [];
    try {
      for (const f of files) {
        const texts = /\.zip$/i.test(f.name) ? await TripImport.unzip(await f.arrayBuffer()) : [{ name: f.name, text: await f.text() }];
        for (const t of texts) { const car = TripImport.parse(t.text, t.name); if (car) found.push(car); }
      }
    } catch (err) { console.warn(err); }
    if (!found.length) return toast('That is not a Road Trip CSV file.');
    importSheet(found);
  });
  function importSheet(found) {
    const plan = TripImport.plan(found, data().raw, today()), pick = new Set(plan.keys());
    const years = p => p.first ? (p.first.slice(0, 4) === p.last.slice(0, 4) ? p.first.slice(0, 4) : `${p.first.slice(0, 4)} to ${p.last.slice(0, 4)}`) : '';
    const row = (p, i) => {
      const what = [p.fuel && plural(p.fuel, 'fill-up'), p.costs && plural(p.costs, 'expense'), p.reminders && plural(p.reminders, 'reminder')].filter(Boolean).join(' · ') || 'Nothing new';
      const where = [years(p), p.isNew ? (p.archived ? 'goes under Archived' : '') : `into your ${esc(cars().find(c => c.id === p.into).name)}`, p.same ? `${p.same} here already` : ''].filter(Boolean).join(' · ');
      const h = HUES[i % HUES.length];
      return `<button class="car${pick.has(i) ? '' : ' off'}" type="button" data-i="${i}"><span class="ic" style="color:var(--${h});background:var(--${h}-bg)">${ICON.car}</span><span class="t"><b>${esc(p.name)}</b><small>${what}</small><small>${where}</small></span>${ICON.tick}</button>`;
    };
    const draw = () => {
      const n = plan.filter((p, i) => pick.has(i)).length;
      box.querySelector('.cars').innerHTML = plan.map(row).join('');
      box.querySelector('#impGo').textContent = n ? `Bring over ${plural(n, 'car')}` : 'Pick a car';
      box.querySelector('#impGo').disabled = !n;
    };
    const box = sheet(`<h2>Import from Road Trip</h2><p class="say">Tap a car to leave it out. Locations, road trips, tires and values stay behind.</p>
      <div class="card cars"></div><button class="primary" type="button" id="impGo" style="width:100%"></button>`);
    draw();
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-i]');
      if (b) { const i = +b.dataset.i; if (pick.has(i)) pick.delete(i); else pick.add(i); draw(); return; }
      if (!e.target.closest('#impGo')) return;
      const chosen = plan.filter((p, i) => pick.has(i)), ops = chosen.flatMap(p => p.ops);
      closeSheet();
      if (!ops.length) return toast('All of it is here already.');
      if (!change(...ops)) return toast('Something in the file did not fit.');
      const show = chosen.filter(p => !p.archived).sort((a, b) => (b.last || '').localeCompare(a.last || ''))[0];
      if (show) { ui.car = show.into; saveUI(); }
      closeFill();
      ui.tab = 'stats';
      saveUI();
      render();
      byId('main').scrollTop = 0;
      toast(`${plural(chosen.length, 'car')} brought over.`);
    });
  }

  // Deleted, with a moment to take it back.
  let undoEl = null, undoT = 0;
  function undo(msg, fn) {
    if (!undoEl) { undoEl = document.createElement('div'); undoEl.className = 'toast tap'; document.body.appendChild(undoEl); }
    undoEl.textContent = `${msg} · Tap to undo`;
    undoEl.classList.add('on', 'tap');
    undoEl.onclick = () => { undoEl.classList.remove('on', 'tap'); clearTimeout(undoT); fn(); toast('Back again.'); };
    clearTimeout(undoT);
    undoT = setTimeout(() => undoEl.classList.remove('on', 'tap'), 5000);
  }

  /* ---------- the header and the buttons around the screens ---------- */
  byId('carBtn').addEventListener('click', carsSheet);
  byId('whoBtn').addEventListener('click', () => { if (cars().length) carsSheet(); });
  byId('addBtn').addEventListener('click', () => {
    const car = current();
    if (!car) return;
    if (ui.tab === 'costs') costSheet(car); else fillSheet(car);
  });
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const car = current();
    if (a.dataset.act === 'newcar') newCarSheet();
    else if (a.dataset.act === 'addfill' && car) fillSheet(car);
    else if (a.dataset.act === 'addcost' && car) costSheet(car);
    else if (a.dataset.act === 'addrem' && car) remSheet(car);
    else if (a.dataset.act === 'import') byId('importFile').click();
    else if (a.dataset.act === 'archived' && !a.closest('.sheet')) archivedSheet();
    else if (a.dataset.act === 'signout') { A.signOut(); dropStore(); people = null; render(); toast('Signed out.'); }
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && openFill && !document.querySelector('.backdrop')) closeFill(); });

  readStore();
  render();
  if (session()) { pull(); if (ui.tab === 'more') loadPeople(); }
})();
