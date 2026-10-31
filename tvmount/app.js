/* TV Mount — the screen. geometry.js does the math and store.js keeps the data; this file
   renders the inputs, the results and the sketch from one computed result. */
(function () {
  'use strict';
  const { $, esc, buzz, sheet, closeSheet, toast, copy, themeSegHTML, homeLinkHTML } = App;
  const G = window.Geo, S = window.Store, isNum = G.isNum;
  App.init({ aurora: false });

  /* ---------- state ---------- */
  const loaded = S.load(localStorage);
  let doc = loaded.doc;
  let r = null;                                   // latest computed result
  const UIKEY = 'tvmount.ui';                     // per-phone conveniences: which cards are folded
  const ui = Object.assign({ shut: {} }, App.load(UIKEY, {}));
  const saveUI = () => App.save(UIKEY, ui);

  const get = (o, path) => path.split('.').reduce((a, k) => a == null ? undefined : a[k], o);
  function set(o, path, v) { const ks = path.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }
  const tab = () => doc.tabs.find(t => t.id === doc.current) || doc.tabs[0];
  const pro = () => doc.settings.mode === 'pro';
  const NB = s => s.replace(/ /g, '\u00a0');   // keep 33 1/8" on one line
  const fmt = v => NB(G.formatInches(v, { prec: doc.settings.prec, dec: doc.settings.dec }));
  const fmtIn = v => NB(G.formatExact(v, { dec: doc.settings.dec }));
  // VESA hole spacing is typed and shown in millimeters, as TV specs list it.
  const MM = ['tv.vesaW', 'tv.vesaH'], inMm = path => MM.includes(path);
  const fmtMm = v => NB(+(+v).toFixed(1) + ' mm');
  const fill = s => G.fill(s, fmt);
  function persist() { if (!S.save(localStorage, doc)) toast('Couldn’t save on this phone'); }
  function update() { persist(); render(); }

  // The wall plate with its measurements, named like the fields under it.
  const PLATE_SVG = (() => {
    const dim = (x1, y1, x2, y2) => { const v = x1 === x2, t = (x, y) => v ? `M${x - 4} ${y}h8` : `M${x} ${y - 4}v8`; return `<path class="dm" d="M${x1} ${y1}L${x2} ${y2}${t(x1, y1)}${t(x2, y2)}"/>`; };
    const slot = (x, y) => `<rect class="lh" x="${x - 3}" y="${y - 7}" width="6" height="14" rx="3"/>`;
    return `<svg class="plate-fig" viewBox="0 0 340 156" role="img" aria-label="Wall plate measurements">
      <rect class="pl" x="100" y="36" width="200" height="80" rx="6"/>
      ${[118, 282].flatMap(x => [52, 100].map(y => slot(x, y))).join('')}
      <path class="ex" d="M100 36H80M112 52H80M112 100H80M118 108V136M282 108V136M100 36V16M300 36V16M300 36h20M300 116h20"/>
      ${dim(100, 22, 300, 22)}${dim(314, 36, 314, 116)}${dim(86, 36, 86, 52)}${dim(86, 52, 86, 100)}${dim(118, 132, 282, 132)}
      <text x="200" y="13" text-anchor="middle">Plate width</text>
      <text transform="translate(322 76) rotate(90)" text-anchor="middle">Plate height</text>
      <text x="78" y="40" text-anchor="end">Plate top →</text><text x="78" y="52" text-anchor="end">lag holes</text>
      <text x="78" y="76" text-anchor="end">Top → bottom</text><text x="78" y="88" text-anchor="end">lag row</text>
      <text x="200" y="150" text-anchor="middle">Left ↔ right lag holes</text>
    </svg>`;
  })();

  // The box in the wall with the corner it is measured to, drawn from the choices in its card.
  function boxFig(t) {
    const kind = t.ref.kind, c = t.box.corner || 'bl', left = t.box.side !== 'right', ceil = kind === 'ceiling';
    const refY = ceil ? 12 : 140, top = ceil ? 70 : 34, w = 60, h = 40;
    const cx = left ? 80 : 220, cy = c[0] === 'b' ? top + h : top;
    const x0 = c[1] === 'l' ? cx : cx - w, out = c[1] === 'l' ? -1 : 1;   // the side of the box the corner is on
    const vx = cx + out * 14, hy = cy + (c[0] === 'b' ? 14 : -14);       // dimensions sit outside the box
    const dim = (x1, y1, x2, y2) => { const v = x1 === x2, k = (x, y) => v ? `M${x - 4} ${y}h8` : `M${x} ${y - 4}v8`; return `<path class="dm" d="M${x1} ${y1}L${x2} ${y2}${k(x1, y1)}${k(x2, y2)}"/>`; };
    const ref = kind === 'floor' ? 'Floor' : kind === 'ceiling' ? 'Ceiling' : surface(t) === 'mantle' ? 'Mantle' : 'Countertop';
    return `<svg class="plate-fig" viewBox="0 0 300 152" role="img" aria-label="Where to measure the box">
      <path class="ref" d="M8 ${refY}H292"/><text x="10" y="${ceil ? refY + 14 : refY - 6}">${ref}</text>
      <path class="cl" d="M150 4V148"/><text x="154" y="${ceil ? 148 : 12}" class="clt">center line</text>
      <rect class="pl" x="${x0}" y="${top}" width="${w}" height="${h}" rx="3"/><text x="${x0 + w / 2}" y="${top + h / 2 + 4}" text-anchor="middle">Box</text>
      <path class="ex" d="M${cx} ${cy}H${vx}M${cx} ${cy}V${hy}M150 ${cy}V${hy}"/>
      ${dim(vx, refY, vx, cy)}${dim(cx, hy, 150, hy)}
      <circle class="cn" cx="${cx}" cy="${cy}" r="4.5"/>
    </svg>`;
  }

  /* ---------- field labels: [label, placeholder] ---------- */
  const F = {
    'tv.w': ['Width'], 'tv.h': ['Height'],
    'tv.vesaTop': ['To TV top'], 'tv.vesaW': ['Width'], 'tv.vesaH': ['Height'],
    'mount.holesToTop': ['Top holes → TV top'], 'mount.holesToBottom': ['Top holes → TV bottom'],
    'mount.hookDrop': ['Top holes → hook'], 'mount.armDrop': ['Arm hook → VESA'], 'mount.sag': ['Sag once hung', 0],
    'mount.plateW': ['Plate width'], 'mount.plateH': ['Plate height'], 'mount.holeDown': ['Plate top → lag holes', 0], 'mount.rowGap': ['Top → bottom lag row', 'one row'],
    'mount.lagSpan': ['Left ↔ right lag holes', 'plate width'], 'mount.slide': ['TV slides left or right', 0],
    'mount.adjUp': ['Can raise TV'], 'mount.adjDown': ['Can lower TV'],
    'ref.mantle.h': ['Mantle height'], 'ref.mantle.hR': ['Right end', 'same'], 'ref.mantle.len': ['Mantle length', 'TV width'],
    'ref.ceiling.h': ['Ceiling height'], 'ref.ff': ['Finished floor adds', 0],
    'center.a': ['First mark'], 'center.b': ['Second mark'], 'center.d': ['Whole distance'],
    'box.w': ['Box width'], 'box.h': ['Box height'], 'box.margin': ['Keep in from edges', 2], 'box.cornerH': ['Corner height'], 'box.cornerX': ['Center line → corner', 0],
    'view.eye': ['Seated eye height', 40], 'view.dist': ['Eyes to wall'],
    'built.top': ['TV top'], 'built.bottom': ['TV bottom'],
    'bar.w': ['Bar width', 'for the sketch'], 'bar.h': ['Bar height'], 'bar.gap': ['TV bottom → bar top'],
    'bar.below': ['Console top', 'floor'], 'bar.holesToTop': ['Holes → bar top'],
    'room.ceil': ['Floor to ceiling'], 'room.mantle': ['Floor to mantle top'], 'room.left': ['Center line → left wall'], 'room.right': ['Center line → right wall']
  };
  // A countertop is placed like a mantle; only the words change.
  const surface = t => t.ref.kind === 'mantle' && t.ref.mantle.what === 'counter' ? 'countertop' : 'mantle';
  function label(path) {
    const t = tab(), kind = t.ref.kind, noun = surface(t), Noun = noun[0].toUpperCase() + noun.slice(1);
    if (/^ref\.(floor|mantle|ceiling)\.value$/.test(path)) {
      const ed = G.edgeOf(t.ref[kind].edge, kind, t.bar), e = G.EDGE_NAME[ed];
      return kind === 'floor' ? e + ' height' : (kind === 'mantle' ? (noun === 'mantle' ? 'Mantle' : 'Counter') + ' to ' : 'Ceiling to ') + (ed === 'bar' ? 'soundbar bottom' : e);
    }
    if (path === 'ref.mantle.h') return pro() ? 'Left end height' : Noun + ' height';
    if (path === 'ref.mantle.len') return Noun + ' length';
    if (path === 'room.mantle') return 'Floor to ' + (noun === 'mantle' ? 'mantle top' : noun);
    if (path === 'box.cornerH') return 'Corner ' + (kind === 'floor' ? 'above floor' : kind === 'mantle' ? 'above ' + noun : 'below ceiling');
    if (/^studs\.list\./.test(path)) return tab().studs.from === 'edge' ? 'Stud from the ' + (t.center.mode !== 'half' && t.center.from === 'right' ? 'right' : 'left') + ' edge' : 'Stud from center (− is left)';
    return (F[path] || [path])[0];
  }

  /* ---------- keypad ---------- */
  // Like Calculator: whole inches on the left, numerator over denominator on the right.
  // kp.at is where keyboard digits go: w, n or d.
  const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  $('#kpNu').innerHTML = DIGITS.map(d => `<button data-key="n${d}" aria-label="Numerator ${d}">${d}</button>`).join('');
  $('#kpDe').innerHTML = DIGITS.map(d => `<button data-key="d${d}" aria-label="Denominator ${d}">${d}</button>`).join('');
  const kp = { path: null, w: '', n: '', d: '', neg: false, fresh: true, at: 'w' };
  const kpBlank = () => !kp.w && !kp.n && !kp.d;

  function loadKp(v) {
    kp.w = ''; kp.n = ''; kp.d = ''; kp.neg = false; kp.at = 'w';
    if (!isNum(v)) return;
    kp.neg = v < 0;
    if (inMm(kp.path)) { kp.w = String(+Math.abs(v).toFixed(2)); return; }
    const a = Math.abs(v), n64 = Math.round(a * 64);
    if (Math.abs(a * 64 - n64) < 1e-7) {
      const w = Math.floor(n64 / 64);
      let num = n64 % 64, den = 64;
      while (num && num % 2 === 0) { num /= 2; den /= 2; }
      kp.w = w || !num ? String(w) : '';
      if (num) { kp.n = String(num); kp.d = String(den); }
    } else kp.w = String(+a.toFixed(4));
  }
  // null when blank, NaN while half typed. A fraction like 1/1 is half typed until the field
  // is left, since 1/16 starts out that way.
  function kpValue(leaving) {
    if (kpBlank()) return null;
    let f = 0;
    if (kp.n || kp.d) {
      const n = +kp.n, d = +kp.d;
      if (!kp.n || !d || (!leaving && n >= d)) return NaN;
      f = n / d;
    }
    return (kp.neg ? -1 : 1) * ((kp.w ? parseFloat(kp.w) : 0) + f);
  }
  // Leaving a field saves a fraction that was held back while typing, like 3/2.
  function commitKp() {
    if (!kp.path) return false;
    const v = kpValue(true);
    if (!isNum(v) || v === get(tab(), kp.path)) return false;
    set(tab(), kp.path, v); persist();
    return true;
  }

  // On a wide screen the form scrolls in its own column, so the keypad room and reveal() go there
  const wide = matchMedia('(min-width:640px)');
  const scroller = () => wide.matches ? $('#rcol') : $('#main');
  function padForKeypad() {
    $('#main').style.paddingBottom = $('#rcol').style.paddingBottom = '';
    if (kp.path) scroller().style.paddingBottom = ($('#kp').offsetHeight + 16) + 'px';
  }
  function openKeypad(path) {
    const first = !kp.path, changed = commitKp();
    kp.path = path; kp.fresh = true;
    loadKp(get(tab(), path));
    $('#kp').hidden = false;
    $('#kp').classList.toggle('mm', inMm(path));   // millimeters have no fractions
    if (changed) render(); else { renderForm(); syncKeypad(); }
    if (first) padForKeypad();
    reveal(path);
  }
  function closeKeypad() {
    if (!kp.path) return;
    commitKp();
    kp.path = null;
    $('#kp').hidden = true;
    padForKeypad();
    const t = tab();
    if (t.studs.list.some(v => !isNum(v))) { t.studs.list = t.studs.list.filter(isNum); persist(); }
    render();
  }
  function reveal(path) {
    const el = document.querySelector(`#form [data-k="${path}"]`);
    if (!el) return;
    const main = scroller(), rc = el.getBoundingClientRect(), mr = main.getBoundingClientRect();
    const bottom = innerHeight - $('#kp').offsetHeight - 12;
    if (rc.bottom > bottom) main.scrollBy({ top: rc.bottom - bottom, behavior: 'smooth' });
    else if (rc.top < mr.top + 8) main.scrollBy({ top: rc.top - mr.top - 8, behavior: 'smooth' });
  }
  function syncKeypad() {
    if (!kp.path) return;
    let h = kpBlank() ? (kp.neg ? '−' : '—') : (kp.neg ? '−' : '') + esc(kp.w);
    if (kp.n || kp.d) h += `<span class="fr"><span class="nu${kp.n ? ' lit' : ''}">${kp.n || '·'}</span><span class="de${kp.d ? ' lit' : ''}">${kp.d || '·'}</span></span>`;
    $('#kpVal').innerHTML = h + (kpBlank() ? '' : inMm(kp.path) ? ' mm' : '"');
    $('#kpVal').classList.toggle('ph', kpBlank());
    const live = r && r.ok ? 'Drill ' + fmt(r.m.hole) + ' ' + r.rows[0].sub : '';
    $('#kpName').innerHTML = esc(label(kp.path)) + (live ? `<span class="live">${esc(live)}</span>` : '');
  }
  function key(k) {
    if (k === 'done') { closeKeypad(); return; }
    if (k === 'next' || k === 'prev') { stepField(k === 'next' ? 1 : -1); return; }
    if (inMm(kp.path) && (/^[nd]\d$/.test(k) || k === 'space' || k === 'over')) return;
    if (k === 'space') { if (kp.w) kp.at = 'n'; return; }       // keyboard: "57 1/8"
    if (k === 'over') {                                          // keyboard: "3/4" moves the 3 up
      if (kp.at === 'w' && !kp.n && kp.w && !kp.w.includes('.') && !kp.fresh) { kp.n = kp.w; kp.w = ''; }
      kp.at = 'd'; syncKeypad(); return;
    }
    const fresh = kp.fresh;
    kp.fresh = false;
    if (/^[nd]?\d$/.test(k) || k === '.') {
      const at = k.length === 2 ? k[0] : 'w';
      // The first key on a filled field replaces it. A whole-inch key starts over,
      // a numerator key keeps the whole inches, a denominator key keeps the numerator too.
      if (fresh) {
        if (at === 'w') { kp.w = ''; kp.neg = false; }
        if (at !== 'd') kp.n = '';
        kp.d = '';
      }
      kp.at = at;
      if (k === '.') { if (!kp.w.includes('.')) kp.w = (kp.w || '0') + '.'; }
      else if (kp[at].replace('.', '').length < (at === 'w' ? 6 : 3)) kp[at] = (kp[at] === '0' ? '' : kp[at]) + k.slice(-1);
    } else if (k === 'back') {
      const at = ['d', 'n', 'w'].find(p => kp[p]);
      if (at) { kp[at] = kp[at].slice(0, -1); kp.at = at; }
    } else if (k === 'sign') kp.neg = !kp.neg;
    else if (k === 'clear') { kp.w = ''; kp.n = ''; kp.d = ''; kp.neg = false; kp.at = 'w'; }
    const v = kpValue(false);
    if (v === null) set(tab(), kp.path, null);
    else if (isNum(v)) set(tab(), kp.path, v);
    else { syncKeypad(); return; }                 // half typed: leave the saved value alone
    update();
  }
  function stepField(dir) {
    const keys = [...document.querySelectorAll('#form [data-k]')].map(b => b.dataset.k);
    const i = keys.indexOf(kp.path), next = keys[i + dir];
    if (next) openKeypad(next); else if (dir > 0) closeKeypad();
  }
  $('#kp').addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b) { buzz(4); key(b.dataset.key); } });
  document.addEventListener('keydown', e => {
    if (!kp.path || e.metaKey || e.ctrlKey || document.querySelector('.backdrop')) return;
    const m = { Backspace: 'back', Enter: 'next', Escape: 'done', Delete: 'clear', '-': 'sign', '.': '.', ' ': 'space', '/': 'over' };
    let k = /^\d$/.test(e.key) ? (kp.at === 'w' ? '' : kp.at) + e.key : m[e.key];
    if (e.key === 'Tab') k = e.shiftKey ? 'prev' : 'next';
    if (k) { e.preventDefault(); key(k); }
  });

  /* ---------- form ---------- */
  let formFields = [];
  function fld(path, o) {
    o = o || {};
    const v = get(tab(), path), ph = o.ph !== undefined ? o.ph : (F[path] || [])[1];
    const lab = o.label || label(path);
    formFields.push([path, lab]);
    const shown = isNum(v) ? (inMm(path) ? fmtMm(v) : fmtIn(v)) : '';
    const phs = ph == null ? '—' : typeof ph === 'number' ? fmt(ph) : ph;
    return `<button class="fld${kp.path === path ? ' on' : ''}${o.wide ? ' wide' : ''}" data-k="${path}"><span class="fk">${esc(lab)}</span><span class="fv${shown ? '' : ' ph'}">${esc(shown || phs)}</span></button>`;
  }
  // Every choice lists its default first, on the left.
  function seg(path, opts, cls) {
    const cur = String(get(tab(), path));
    return `<div class="seg${cls ? ' ' + cls : ''}" data-seg="${path}">${opts.map(([v, l]) => `<button data-v="${v}" class="${cur === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  }
  const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  const PENCIL = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
  // Each card has a color: its icon, its selected buttons and the field being typed in use it,
  // and so does its part of the sketch. The five Simple cards get five different colors.
  const ICON = {
    tv: ['purple', '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 20h6"/>'],
    bracket: ['blue', '<rect x="5" y="4" width="14" height="16" rx="2"/><circle cx="9" cy="8" r="1"/><circle cx="15" cy="8" r="1"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/>'],
    place: ['orange', '<path d="M12 4v16M8.5 7.5 12 4l3.5 3.5M8.5 16.5 12 20l3.5-3.5"/>'],
    center: ['magenta', '<path d="M12 3v3M12 10.5v3M12 18v3M3 12h5M5.5 9.5 3 12l2.5 2.5M21 12h-5M18.5 9.5 21 12l-2.5 2.5"/>'],
    bar: ['teal', '<rect x="2" y="9" width="20" height="6" rx="3"/><circle cx="7" cy="12" r=".6"/><circle cx="12" cy="12" r=".6"/><circle cx="17" cy="12" r=".6"/>'],
    studs: ['yellow', '<path d="M6 3v18M12 3v18M18 3v18"/>'],
    box: ['green', '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/>'],
    view: ['purple', '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>'],
    built: ['lime', '<path d="m5 12.5 4.5 4.5L19 7.5"/>'],
    room: ['gray', '<path d="M3 11 12 4l9 7"/><path d="M5.5 9.5V20h13V9.5"/>']
  };
  // Cards are open unless folded; the sketch-only Room card starts folded.
  const isShut = id => id in ui.shut ? ui.shut[id] : id === 'room';
  function card(id, title, body, badge) {   // badge: true for Pro, or a word such as 'Sketch'
    const [hue, glyph] = ICON[id];
    return `<section class="card sec hue-${hue}${isShut(id) ? ' shut' : ''}" data-sec="${id}"><button class="sec-h" data-fold="${id}"><span class="ic ${hue}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></span><span>${title}</span>${badge === true ? '<span class="pro">Pro</span>' : badge ? `<span class="tag">${badge}</span>` : ''}${CHEV}</button><div class="sec-b">${body}</div></section>`;
  }
  const hint = s => `<p class="hint">${s}</p>`;
  function libButtons(kind) {
    const t = tab(), model = kind === 'tv' ? t.tv.model : t.mount.model, n = doc.lib[kind === 'tv' ? 'tvs' : 'mounts'].length;
    return `<div class="row"><button class="btn" data-lib="${kind}">${model ? esc(model) : kind === 'tv' ? 'Saved TVs' : 'Saved mounts'}${n ? ` <span class="cnt">${n}</span>` : ''}</button><button class="btn" data-libsave="${kind}">Save ${kind === 'tv' ? 'TV' : 'mount'}</button></div>`;
  }
  const studName = (s, from) => from === 'edge' ? fmtIn(s) : (s < 0 ? 'L ' : s > 0 ? 'R ' : '') + fmtIn(Math.abs(s));

  function renderForm() {
    formFields = [];
    const t = tab(), P = pro(), kind = t.ref.kind;
    let h = '', b;

    // TV
    b = seg('tv.src', [['size', 'Standard size'], ['measured', 'Measured']]);
    if (t.tv.src === 'size') {
      b += `<div class="chips sizes">${G.SIZES.map(s => `<button class="chip${t.tv.size === s ? ' on' : ''}" data-size="${s}">${s}</button>`).join('')}</div>`;
      const est = G.sizeEstimate(t.tv.size);
      b += hint(est ? `About ${fmt(est.w)} wide × ${fmt(est.h)} tall. An estimate: measure the real TV when you can.` : 'Pick the class size, 43″ to 98″.');
    } else b += `<div class="grid2">${fld('tv.w')}${fld('tv.h')}</div>`;
    if (P) {
      b += `<div class="label">VESA holes</div><div class="grid3">${fld('tv.vesaW')}${fld('tv.vesaH')}${fld('tv.vesaTop')}</div>`;
      b += hint('Hole spacing in millimeters, as the TV’s specs list it, like 400 × 300. Then the top holes up to the TV top. The holes sit centered on the TV.') + libButtons('tv');
    }
    h += card('tv', 'TV', b);

    // bracket
    b = '';
    if (P) b += seg('mount.chain', [['measured', 'One measurement'], ['split', 'Split chain']]);
    if (!P || t.mount.chain !== 'split') {
      const toBottom = t.mount.holesFrom === 'bottom';
      b += seg('mount.holesFrom', [['top', 'To TV top'], ['bottom', 'To TV bottom']]);
      b += `<div class="grid2">${fld(toBottom ? 'mount.holesToBottom' : 'mount.holesToTop', { wide: !P })}${P ? fld('mount.sag') : ''}</div>`;
      b += hint(toBottom ? 'Arms on the TV, plate hung on the arms: measure from the top row of plate holes down to the bottom of the TV.'
        : 'Arms on the TV, plate hung on the arms: measure from the top row of plate holes to the top of the TV. Use ± if the holes sit above it.');
    } else {
      b += `<div class="grid2">${fld('mount.hookDrop')}${fld('mount.armDrop')}${fld('tv.vesaTop', { label: 'VESA → TV top' })}${fld('mount.sag')}</div>`;
      const c = r.chain;
      b += `<div class="chain">${c.measured != null
        ? `${fmt(c.vesaTop)} VESA − ${fmt(c.hookDrop)} hook − ${fmt(c.armDrop)} arm${c.sag ? ' − ' + fmt(c.sag) + ' sag' : ''} = <b>${fmt(c.hung)}</b> top holes to TV top`
        : 'Plate top holes down to the hook, the arm’s hook down to its top VESA hole, then the TV’s top VESA holes up to its top edge.'}</div>`;
    }
    if (P) {
      b += `<div class="label">Wall plate</div>${PLATE_SVG}<div class="grid2">${fld('mount.plateW')}${fld('mount.plateH')}${fld('mount.holeDown')}${fld('mount.rowGap')}${fld('mount.lagSpan', { wide: true })}</div>`;
      b += hint('The wall plate is the part that bolts to the wall. Lag holes are its holes for the lag bolts into the studs. Measure from the center of each hole.');
      b += `<div class="label">Lag bolts go into</div>` + seg('mount.studsNeeded', [['null', 'Auto'], ['1', '1 stud'], ['2', '2 studs'], ['3', '3 studs']]);
      b += hint(t.mount.studsNeeded == null ? 'Auto picks 2 studs when the lag holes are 16" or more apart, and 1 when they are closer.' : 'The plate goes where its lag holes reach this many studs.');
      b += `<div class="label">Adjustment</div><div class="grid2">${fld('mount.adjUp')}${fld('mount.adjDown')}${fld('mount.slide', { wide: true })}</div>`;
      b += hint('How far the mount lets the TV move once it hangs. Leave blank if it has no adjustment.');
      b += libButtons('mount');
    }
    h += card('bracket', 'Bracket', b);

    // placement
    const k = t.ref[kind];
    const noun = surface(t);
    b = `<div class="seg" data-seg="ref.kind">${[['floor', 'Floor'], ['mantle', 'Mantle'], ['counter', 'Counter'], ['ceiling', 'Ceiling']].map(([v, l]) =>
      `<button data-v="${v}" class="${(noun === 'countertop' ? 'counter' : kind) === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    // with a soundbar, the long "Soundbar bottom" gets a wider button and its field the full row
    const hasBar = t.bar.kind !== 'none', barEdge = G.edgeOf(k.edge, kind, t.bar) === 'bar';
    b += `<div class="label">Set the</div>` + seg('ref.' + kind + '.edge', [['bottom', hasBar ? 'Soundbar bottom' : 'TV bottom'], ['center', 'TV center'], ['top', 'TV top']], hasBar ? 'fit' : '');
    b += `<div class="grid2">${fld('ref.' + kind + '.value', { wide: barEdge })}`;
    if (kind === 'mantle') b += fld('ref.mantle.h') + (P ? fld('ref.mantle.hR') + fld('ref.mantle.len') : '');
    if (kind === 'ceiling') b += fld('ref.ceiling.h');
    if (P) b += fld('ref.ff');
    b += '</div>';
    if (kind === 'mantle') b += hint(P ? `Measure the ${noun} height from the floor at both ends. The gap holds at the high end; the TV is taken as centered on the ${noun}.` : `${noun === 'mantle' ? 'Mantle' : 'Countertop'} height is optional; add it to get heights from the floor too.`);
    if (kind === 'ceiling') b += hint('Ceiling height is optional; add it to get heights from the floor too.');
    if (P && t.ref.ff) b += hint('Plan to the finished floor; marks are given from the floor as it is today.');
    h += card('place', 'Placement', b);

    // center line
    const ct = r.center;
    b = seg('center.mode', [['half', 'Half a distance'], ['two', 'Two marks']]);
    if (t.center.mode !== 'half') b += seg('center.from', [['left', 'From left'], ['right', 'From right']]);   // half is the same from either end
    b += t.center.mode === 'half' ? `<div class="grid2">${fld('center.d', { wide: true })}</div>` : `<div class="grid2">${fld('center.a')}${fld('center.b')}</div>`;
    b += ct ? `<div class="res">Center line <b>${fmt(ct.pos)}</b> ${ct.mode === 'half' ? 'from either end' : 'from the ' + ct.from + ' edge'}${ct.mode === 'two' ? `, ${fmt(ct.half)} to each mark` : ''}</div>`
      : hint(t.center.mode === 'half' ? 'One distance, like the wall or the mantle; the center is half of it.' : 'Two marks measured from the same edge, like both sides of a fireplace.');
    h += card('center', 'Center line', b);

    // soundbar
    const sb = t.bar;
    b = seg('bar.kind', [['none', 'None'], ['wall', 'On the wall'], ['tv', 'On the TV']]);
    if (sb.kind === 'wall') b += `<div class="label">Place it</div>` + seg('bar.place', [['gap', 'Gap below TV'], ['center', 'Centered']]);
    if (sb.kind !== 'none') {
      const centered = sb.kind === 'wall' && sb.place === 'center';
      b += `<div class="grid2">${fld('bar.w')}${fld('bar.h')}`;
      if (sb.kind === 'wall' && !centered) b += fld('bar.gap', { ph: G.DEFAULTS.barGap });   // an attachment holds the bar flush under the TV
      if (centered && kind !== 'mantle') b += fld('bar.below');
      if (sb.kind === 'wall') b += fld('bar.holesToTop');
      b += '</div>';
      if (sb.kind === 'wall') b += hint((centered ? (kind === 'mantle' ? 'Centered between the TV bottom and the ' + (noun === 'mantle' ? 'mantle top' : noun) + '.' : 'Centered between the TV bottom and the console top. Leave the console blank to center over the floor.') + ' '
          : '') + 'Hang the bracket on the bar, then measure from its holes to the bar top. The bar is centered on the TV center line.');
    }
    h += card('bar', 'Soundbar', b);

    // room: sketch only
    b = `<div class="grid2">${kind !== 'ceiling' ? fld('room.ceil') : ''}${kind !== 'mantle' ? fld('room.mantle') : ''}${fld('room.left')}${fld('room.right')}</div>`;
    b += hint('Only screenshot mode draws these. They do not change where you drill. Turn the phone sideways there to fit the whole wall.'
      + (!r.floorKnown && (isNum(t.room.ceil) || isNum(t.room.mantle)) ? ' Add the ' + kind + ' height in Placement to place the heights.' : ''));
    b += `<div class="row"><button class="btn" data-shot>Open screenshot mode</button></div>`;
    h += card('room', 'Room', b, 'Sketch');

    if (P) {
      // studs
      b = seg('studs.from', [['center', 'From center line'], ['edge', 'From the edge']]);
      b += `<div class="studs">${t.studs.list.map((s, i) => `<span class="studchip${kp.path === 'studs.list.' + i ? ' on' : ''}"><button class="sv" data-k="studs.list.${i}">${isNum(s) ? esc(studName(s, t.studs.from)) : '…'}</button><button class="sx" data-delstud="${i}" aria-label="Remove stud">×</button></span>`).join('')}<button class="chip" data-addstud>+ Stud</button></div>`;
      t.studs.list.forEach((s, i) => formFields.push(['studs.list.' + i, 'Stud']));
      b += `<div class="row"><button class="btn" data-fillstuds>Fill every 16″</button><button class="btn" data-clearstuds>Clear</button></div>`;
      b += hint(t.studs.from === 'edge' ? 'Stud centers from the same edge as the center line.' : 'Stud centers from the center line. Left is negative: tap ± on the keypad.');
      h += card('studs', 'Studs', b, true);

      // box
      b = seg('box.on', [[false, 'No box'], [true, 'Recessed box']]);
      if (t.box.on) {
        b += seg('box.place', [['auto', 'Find a spot'], ['set', 'Already in the wall']]);
        if (t.box.place === 'set') {
          b += `<div class="grid2">${fld('box.w')}${fld('box.h')}</div>`;
          b += `<div class="label">Measure to this corner</div>` + seg('box.corner', [['bl', 'Bottom left'], ['br', 'Bottom right'], ['tl', 'Top left'], ['tr', 'Top right']], 'two');
          b += `<div class="label">The corner is</div>` + seg('box.side', [['left', 'Left of center line'], ['right', 'Right of center line']]);
          b += boxFig(t) + `<div class="grid2">${fld('box.cornerH')}${fld('box.cornerX')}</div>`;
          b += hint('Left and right as you face the wall. The box can sit behind the plate.');
        }
        else b += `<div class="grid3">${fld('box.w')}${fld('box.h')}${fld('box.margin', { label: 'Keep in' })}</div>` + hint('Finds room behind the TV and between studs for a recessed power and low-voltage box. Half the box sits past the plate edge.');
      }
      h += card('box', 'Rough-in box', b, true);

      // viewing
      b = `<div class="grid2">${fld('view.eye')}${fld('view.dist')}</div>` + hint('Up to 15° above seated eye level is comfortable; past 30° strains necks.');
      h += card('view', 'Viewing angle', b, true);

      // as built
      b = `<div class="grid2">${fld('built.top', { label: 'TV top, measured' })}${fld('built.bottom', { label: 'TV bottom, measured' })}</div>`;
      b += hint('After hanging, measure from the ' + (kind === 'floor' ? 'floor' : kind) + ' like the marks were given.');
      const lm = r.built && t.mount.model && doc.lib.mounts.find(m => m.model.trim().toLowerCase() === t.mount.model.trim().toLowerCase());
      if (lm && Math.abs(r.built.avg) >= 1 / 64) b += `<div class="row"><button class="btn" data-savesag>Save sag ${esc(fmt(r.built.sag))} to ${esc(lm.model)}</button></div>`;
      h += card('built', 'As built', b, true);
    }
    $('#form').innerHTML = h;
  }

  $('#form').addEventListener('click', e => {
    const t = tab();
    const fold = e.target.closest('[data-fold]');
    if (fold) { const id = fold.dataset.fold; ui.shut[id] = !isShut(id); saveUI(); fold.parentElement.classList.toggle('shut', ui.shut[id]); return; }
    if (e.target.closest('[data-shot]')) { openShot(); return; }
    const f = e.target.closest('[data-k]');
    if (f) { buzz(4); openKeypad(f.dataset.k); return; }
    const sb = e.target.closest('[data-seg] button');
    if (sb) {
      const path = sb.parentElement.dataset.seg;
      let v = sb.dataset.v;
      if (path === 'box.on') v = v === 'true';
      if (path === 'ref.kind' && (v === 'mantle' || v === 'counter')) { t.ref.mantle.what = v; v = 'mantle'; }
      if (path === 'mount.studsNeeded') v = v === 'null' ? null : +v;
      if (path === 'studs.from' && v !== t.studs.from) convertStuds(t, v);
      set(t, path, v); buzz(6); update(); return;
    }
    const sz = e.target.closest('[data-size]');
    if (sz) { t.tv.size = +sz.dataset.size; buzz(6); update(); return; }
    if (e.target.closest('[data-addstud]')) { t.studs.list.push(null); openKeypad('studs.list.' + (t.studs.list.length - 1)); return; }
    const del = e.target.closest('[data-delstud]');
    if (del) { const i = +del.dataset.delstud; if (kp.path && kp.path.startsWith('studs.list.')) closeKeypad(); t.studs.list.splice(i, 1); update(); return; }
    if (e.target.closest('[data-fillstuds]')) { fillStuds(); return; }
    if (e.target.closest('[data-clearstuds]')) { if (kp.path && kp.path.startsWith('studs.list.')) closeKeypad(); t.studs.list = []; update(); return; }
    const lib = e.target.closest('[data-lib]');
    if (lib) { closeKeypad(); libSheet(lib.dataset.lib); return; }
    const ls = e.target.closest('[data-libsave]');
    if (ls) { closeKeypad(); libSaveSheet(ls.dataset.libsave); return; }
    if (e.target.closest('[data-savesag]')) {
      const m = doc.lib.mounts.find(x => x.model.trim().toLowerCase() === t.mount.model.trim().toLowerCase());
      if (m && r.built) { m.sag = Math.round(r.built.sag * 64) / 64; persist(); toast('Sag ' + fmt(m.sag) + ' saved to ' + m.model); render(); }
    }
  });

  // switching how studs are measured keeps them in the same place on the wall
  function convertStuds(t, to) {
    const c = G.centerTool(t.center);
    if (!c) return;
    const dir = c.from === 'right' ? -1 : 1;
    t.studs.list = t.studs.list.map(s => !isNum(s) ? s : to === 'edge' ? c.pos + dir * s : dir * (s - c.pos));
  }
  function fillStuds() {
    const t = tab(), list = t.studs.list.filter(isNum);
    if (!list.length) { toast('Add one stud first'); return; }
    const reach = (r.tv.w || 60) / 2 + 16;
    let out;
    if (t.studs.from === 'edge') {
      if (!r.center) { toast('Fill in the center line first'); return; }
      const c = r.center.pos, known = list.reduce((a, s) => Math.abs(s - c) < Math.abs(a - c) ? s : a);
      out = G.fillStuds(known, 16, c - reach, c + reach).filter(s => s >= 0);
    } else {
      const known = list.reduce((a, s) => Math.abs(s) < Math.abs(a) ? s : a);
      out = G.fillStuds(known, 16, -reach, reach);
    }
    closeKeypad();
    t.studs.list = out; buzz(8); update();
  }

  /* ---------- results ---------- */
  function needText() {
    const t = tab();
    const lower = s => /^TV/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
    const names = r.missing.map(k => /^ref\.\w+\.value$/.test(k) ? lower(label('ref.' + t.ref.kind + '.value')) : (G.FIELD_NAME[k] || k));
    return names.length ? 'Fill in ' + names.join(', ') : '';
  }
  // Result labels take the color their part has on the sketch.
  const HUE = { chain: 'blue', vesa: 'blue', plate: 'blue', adjust: 'blue', mantle: 'orange', gaps: 'orange', gap: 'orange', bar: 'teal', centerline: 'magenta', studs: 'yellow', box: 'green', view: 'purple', built: 'lime' };
  function factHTML(x) {
    const v = x.s != null ? fill(x.s) : x.v != null ? fmt(x.v) : '—';
    return `<div class="li${x.cls ? ' ' + x.cls : ''}${HUE[x.id] ? ' h-' + HUE[x.id] : ''}"><div class="k">${esc(x.k)}</div><div class="v">${esc(v)}</div>${x.sub ? `<div class="s">${esc(fill(x.sub))}</div>` : ''}${x.alt ? `<div class="a">${esc(fill(x.alt))}</div>` : ''}</div>`;
  }
  function renderResults() {
    const by = id => r.rows.find(x => x.id === id), hero = by('hole');
    let h = r.ok
      ? `<div class="hero"><div class="k">Drill top holes</div><div class="v">${fmt(hero.v)}</div><div class="s">${esc(hero.sub)}${hero.alt ? ' · ' + esc(fill(hero.alt)) : ''}</div></div>`
      : `<div class="hero empty"><div class="k">Drill top holes</div><div class="v">—</div><div class="s">${esc(needText())}</div></div>`;
    const tri = ['top', 'center', 'bottom'].map(by);
    if (tri.some(x => x.v != null)) h += `<div class="tri">${tri.map(x => `<div class="fact${x.id === r.ref.edge ? ' set' : ''}"><div class="k">${x.k}</div><div class="v">${x.v != null ? fmt(x.v) : '—'}</div><div class="s">${esc(x.alt ? fill(x.alt) : x.sub)}</div></div>`).join('')}</div>`;
    const bh = by('barhole');
    if (bh) h += `<div class="hero sb"><div class="k">${esc(bh.k)}</div><div class="v">${fmt(bh.v)}</div><div class="s">${esc(bh.sub)}${bh.alt ? ' · ' + esc(fill(bh.alt)) : ''}</div></div>`;
    const rest = r.rows.filter(x => !['hole', 'top', 'center', 'bottom', 'barhole', 'tv'].includes(x.id));
    if (rest.length) h += `<div class="card list">${rest.map(factHTML).join('')}</div>`;
    if (r.warnings.length) h += `<ul class="warns">${r.warnings.map(w => `<li>${esc(fill(w))}</li>`).join('')}</ul>`;
    $('#res').innerHTML = h;
  }

  /* ---------- sketch ---------- */
  const VE = ' vector-effect="non-scaling-stroke"';
  const N = v => Math.round(v * 1000) / 1000;
  const EXAMPLE = (() => { const t = G.newTab('Example'); t.tv.src = 'size'; t.tv.size = 65; t.mount.holesToTop = 4.5; t.ref.floor.value = 30; return t; })();

  // Lay the sketch out at label size f (wall inches). Returns svg markup and its viewBox.
  // view: 'phone' (the app), 'crew' (installer screenshot) or 'client' (client screenshot).
  // Room items show in screenshots only; the client sees no holes, studs or layout marks.
  const SHOWS = { phone: i => !i.room && !i.client, crew: i => !i.client, client: i => !i.crew };
  function sketchSVG(sk, f, example, hid, view) {
    const items = sk.items.filter(SHOWS[view] || SHOWS.phone), tv = sk.tv;
    const B = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const grow = (x, y) => { B.x0 = Math.min(B.x0, x); B.x1 = Math.max(B.x1, x); B.y0 = Math.min(B.y0, y); B.y1 = Math.max(B.y1, y); };
    for (const it of items) {
      if (it.t === 'rect') { grow(it.x0, it.y0); grow(it.x1, it.y1); }
      else if (it.t === 'poly') it.pts.forEach(p => grow(p[0], p[1]));
      else if (it.t === 'line') {
        if (it.hspan) { grow(it.x0, it.y0); grow(it.x1, it.y0); }
        else if (it.vspan) { if (!it.far) grow(it.x0, tv.y0); if (it.cls === 'wall') grow(it.x0 + it.side * 2, tv.y0); }
        else { grow(it.x0, it.y0); grow(it.x1, it.y1); }
      } else if (it.t === 'dot' || it.t === 'mark') grow(it.x, it.y);
    }
    if (items.some(i => i.t === 'label' && i.below)) grow(tv.x0, tv.y0 - f * 2);
    // the mantle's name sits under it; edge and mark names, when there are any, get a row below that
    const named = items.some(i => i.t === 'line' && i.vspan && i.text && i.cls !== 'stud');
    for (const m of items.filter(i => i.t === 'label' && i.cls === 'mantle')) grow(0, m.top - 2.5 - f * (named ? 3.1 : 1.8));
    // stud and edge names sit just inside the bottom of the drawing (above the floor when there is one)
        const studRow = B.y0 + f * 0.8, edgeRow = B.y0 + f * 0.8;

    const textW = (s, fs) => String(s).length * 0.56 * (fs || f);
    // a side dimension's label: name and value, the value alone, smaller, or above the dimension when it is too short
    const sideLabel = (d, lo, hi) => {
      const room = hi - lo - f * 0.6, value = example ? '' : fmt(d.v);
      let s = example ? d.name : d.name + ' ' + value, fs = f, over = false;
      if (textW(s) > room) s = example ? d.name : value;
      if (textW(s) > room) { if (textW(s) * 0.6 <= room) fs = f * room / textW(s); else over = true; }
      return { s, fs, over };
    };

    // dimension tiers: shortest nearest the drawing; dims that don't overlap share a tier.
    // A label above its dimension counts as part of it, so the next dimension up moves out a tier.
    const pad = f * 1.5, gap = f * 2.3, tiers = {}, placed = [];
    for (const s of ['left', 'right', 'top', 'bottom']) {
      const list = items.filter(i => i.t === 'dim' && i.side === s)
        .map(d => {
          const p = { d, lo: Math.min(d.a, d.b), hi: Math.max(d.a, d.b) };
          p.end = p.hi;
          if (s === 'left' || s === 'right') { p.lab = sideLabel(d, p.lo, p.hi); if (p.lab.over) p.end = p.hi + f * 0.8 + textW(p.lab.s); }
          return p;
        })
        .sort((p, q) => (p.hi - p.lo) - (q.hi - q.lo));
      const rows = [];
      for (const p of list) {
        let k = 0;
        while (rows[k] && rows[k].some(q => p.lo < q.end - 1e-6 && q.lo < p.end - 1e-6)) k++;
        (rows[k] = rows[k] || []).push(p); p.k = k; placed.push(p);
      }
      tiers[s] = rows.length;
    }
    const reach = n => n ? pad + (n - 1) * gap + f * 0.9 : 0;
    // the floor's name sits at the right end on the row of the edge names: leave it room past them
    const endName = items.find(i => i.t === 'line' && i.hspan && i.text && i.cls !== 'ceiling' && i.cls !== 'eye' && Math.abs(i.y0 + f * 0.8 - edgeRow) < f * 0.5);
    if (endName) for (const it of items) {
      if (it.t === 'line' && it.vspan && it.text && it.cls !== 'stud' && !it.far)
        B.x1 = Math.max(B.x1, it.x0 + textW(it.text, f * 0.85) / 2 + f * 0.4 + textW(endName.text, f * 0.9) - reach(tiers.right));
    }
    const E = { x0: B.x0 - reach(tiers.left), x1: B.x1 + reach(tiers.right), y0: B.y0 - reach(tiers.bottom), y1: B.y1 + reach(tiers.top) };

    const back = [], mid = [], front = [], text = [];
    const L = (cls, x0, y0, x1, y1) => `<line class="${cls}" x1="${N(x0)}" y1="${N(-y0)}" x2="${N(x1)}" y2="${N(-y1)}"${VE}/>`;
    const T = (cls, x, y, s, o) => {
      o = o || {};
      const fs = o.fs || f;
      return `<text class="${cls}" x="${N(x)}" y="${N(-y)}" font-size="${N(fs)}" stroke-width="${N(fs * 0.34)}" text-anchor="${o.anchor || 'middle'}" dominant-baseline="central"${o.rot ? ` transform="rotate(-90 ${N(x)} ${N(-y)})"` : ''}>${esc(s)}</text>`;
    };
    const val = s => example ? s.replace(/\{[^}]*\}/g, '…') : fill(s);

    for (const it of items) {
      if (it.t === 'line') {
        let { x0, x1, y0, y1 } = it;
        if (it.hspan) { x0 = E.x0; x1 = E.x1; }
        if (it.vspan) {
          if (it.x0 < E.x0 - 1e-6 || it.x0 > E.x1 + 1e-6) continue;
          y0 = it.cls === 'edge' || it.cls === 'markline' ? E.y0 : B.y0; y1 = B.y1;
        }
        const ln = L(it.cls, x0, y0, x1, y1);
        if (it.cls === 'wall') back.push(`<rect class="wallfill" x="${N(Math.min(x0, x0 + it.side * 2))}" y="${N(-y1)}" width="2" height="${N(y1 - y0)}"/>`);
        (['stud', 'drill', 'center'].includes(it.cls) ? front : back).push(ln);
        if (it.text) {
          const s = val(it.text);
          if (it.hspan) {
            // the ceiling's name sits under it at the left, inside the drawing, clear of the right-hand dimensions
            if (it.cls === 'ceiling') text.push(T('ll', B.x0 + f * 0.4, y0 - f * 0.8, s, { anchor: 'start', fs: f * 0.9 }));
            else if (it.cls === 'eye') text.push(T('el', Math.min(B.x1, ...items.filter(i => i.cls === 'wall' && i.side > 0).map(i => i.x0 - f * 0.4)), y0 + f * 0.8, s, { anchor: 'end', fs: f * 0.9 }));   // inside the right wall
            else text.push(T('ll', E.x1, y0 + f * 0.8, s, { anchor: 'end', fs: f * 0.9 }));
          } else if (it.cls === 'stud') text.push(T('stl', it.x0, studRow + textW(s, f * 0.85) / 2 - f * 0.4, s, { fs: f * 0.85, rot: true }));
          else text.push(T('cll', it.x0, edgeRow, s, { fs: f * 0.85 }));
        }
      } else if (it.t === 'poly') {
        back.push(`<polygon class="${it.cls}" points="${it.pts.map(p => N(p[0]) + ',' + N(-p[1])).join(' ')}"${VE}/>`);
      } else if (it.t === 'rect') {
        const w = it.x1 - it.x0, hh = it.y1 - it.y0;
        const el = `<rect class="${it.cls}" x="${N(it.x0)}" y="${N(-it.y1)}" width="${N(w)}" height="${N(hh)}"${it.cls === 'tv' ? ` rx="${N(Math.min(0.6, hh / 20))}"` : it.cls === 'sbar' ? ` rx="${N(Math.min(0.8, hh / 3))}"` : ''}${it.cls === 'zone' ? ` fill="url(#${hid})"` : ''}${VE}/>`;
        if (it.cls === 'tv') { mid.push(el); mid.push(`<rect class="scr" x="${N(it.x0 + 0.4)}" y="${N(-it.y1 + 0.4)}" width="${N(Math.max(0, w - 0.8))}" height="${N(Math.max(0, hh - 1.2))}"${VE}/>`); }
        else if (it.cls === 'zone' || it.cls === 'sbar') mid.push(el);
        else front.push(el);
        if (it.text) text.push(it.cls === 'sbar'
          ? T('sbl', (it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, val(it.text), { fs: Math.min(f * 0.8, hh * 0.62) })
          : T('zl', (it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, it.text, { fs: f * 0.85 }));
        if (it.cls === 'built') text.push(T('bl', it.x1 - f * 0.4, it.y0 + f * 0.5, 'as built', { fs: f * 0.75, anchor: 'end' }));
      } else if (it.t === 'dot') {
        front.push(`<circle class="${it.cls}" cx="${N(it.x)}" cy="${N(-it.y)}" r="${N(f * 0.32)}"${VE}/>`);
      } else if (it.t === 'mark') {
        const m = f * 0.45;
        front.push(L(it.cls, it.x - m, it.y, it.x + m, it.y), L(it.cls, it.x, it.y - m, it.x, it.y + m));
      } else if (it.t === 'label') {
        if (it.cls === 'tvname') {
          // bottom-left inside the TV, clear of the plate, holes and center mark
          let fs = f * 0.95;
          const x = tv.x0 + f * 0.6, th = tv.y1 - tv.y0, base = tv.y0 + f * 0.6 + fs * 0.5;
          // shrink to fit left of the box, plate or "as built" where they share a line's height
          const fit = (s, fs, base) => {
            const lo = base - fs * 0.25, hi = base + fs;
            let room = tv.x1 - f * 0.6 - x;
            for (const o of items) {
              if (o.t !== 'rect' || o.x1 <= x) continue;
              if ((o.cls === 'box' || o.cls === 'plate') && o.y0 < hi && o.y1 > lo) room = Math.min(room, o.x0 - f * 0.5 - x);
              const by = o.y0 + f * 0.5;
              if (o.cls === 'built' && by < hi && by + f * 0.75 > lo) room = Math.min(room, o.x1 - f * 0.9 - textW('as built', f * 0.75) - x);
            }
            return room / (textW(s, fs) * 1.12);   // model numbers are mostly capitals and digits, wider than average
          };
          const k = Math.min(1, fit(val(it.lines[0]), fs, base));   // a small TV in a big drawing: shrink the name, or leave it out
          fs *= Math.max(0.45, k);
          if (k < 0.45) { /* no room for the name */ }
          else if (th > fs * 2.2) text.push(T('tl', x, base, val(it.lines[0]), { fs, anchor: 'start' }));
          else text.push(T('tl', x, tv.y0 + th * 0.3, val(it.lines[0]), { fs: Math.min(fs, th * 0.5), anchor: 'start' }));
        } else if (it.cls === 'mantle') {
          const mx = Math.min(...items.filter(i => i.t === 'poly' && i.cls === 'mantle').flatMap(i => i.pts.map(p => p[0])));
          text.push(T('ll', isFinite(mx) ? mx : it.x, it.top - 2.5 - f * 0.8, it.lines[0], { fs: f * 0.85, anchor: isFinite(mx) ? 'start' : 'middle' }));
        }
        else if (it.cls === 'gap') text.push(T('gl', it.x, it.y - f * 0.9, val(it.lines[0]), { anchor: it.anchor, fs: f * 0.85 }));
        else text.push(T('ll', it.x, it.y, val(it.lines.join(' ')), { anchor: it.anchor }));
      }
    }

    // dimensions: drill red, the number you set orange, TV purple, bracket blue, soundbar teal, center line magenta
    // (label classes must not match shape classes such as .tv or .hole, or they take that shape's outline)
    const dimCls = d => 'dl' + (d.key === 'hole' || d.key === 'barhole' ? ' drl' : d.input ? ' in' : d.key === 'chain' ? ' br' : d.key === 'tv' ? ' tvd'
      : d.key === 'bargap' || d.key === 'bartop' ? ' sb' : d.side === 'bottom' ? ' cl' : '');
    const dims = [], t = f * 0.38;
    let top = E.y1;   // a label too long for its dimension sits above it; the drawing grows to fit it
    const tick = (x, y) => L('dim', x - t, y - t, x + t, y + t);
    for (const p of placed) {
      const d = p.d, off = pad + p.k * gap;
      const name = d.name, value = example ? '' : fmt(d.v);
      const full = example ? name : name + ' ' + value;
      if (d.side === 'left' || d.side === 'right') {
        const sgn = d.side === 'left' ? -1 : 1;
        const X = d.side === 'left' ? B.x0 - off : B.x1 + off;
        const xe = d.side === 'left' ? tv.x0 : tv.x1;
        for (const yy of [d.a, d.b]) dims.push(`<line class="ext" x1="${N(xe + sgn * f * 0.25)}" y1="${N(-yy)}" x2="${N(X + sgn * f * 0.45)}" y2="${N(-yy)}"${VE}/>`);
        dims.push(L('dim', X, d.a, X, d.b), tick(X, d.a), tick(X, d.b));
        const { s, fs, over } = p.lab;
        const cy = over ? p.hi + textW(s) / 2 + f * 0.5 : (p.lo + p.hi) / 2;
        if (over) top = Math.max(top, cy + textW(s) / 2);
        text.push(T(dimCls(d), X, cy, s, { rot: true, fs }));
      } else {
        const Y = d.side === 'top' ? B.y1 + off : B.y0 - off;
        let a = d.a, b = d.b;
        const lo = E.x0 + f * 0.4, hi = E.x1 - f * 0.4;
        const clipA = a < lo || a > hi, clipB = b < lo || b > hi;
        a = Math.max(lo, Math.min(hi, a)); b = Math.max(lo, Math.min(hi, b));
        if (d.side === 'top') for (const xx of [a, b]) dims.push(`<line class="ext" x1="${N(xx)}" y1="${N(-(tv.y1 + f * 0.25))}" x2="${N(xx)}" y2="${N(-(Y + f * 0.45))}"${VE}/>`);
        dims.push(L('dim', a, Y, b, Y));
        for (const [xx, clip, other] of [[a, clipA, b], [b, clipB, a]]) {
          if (!clip) { dims.push(tick(xx, Y)); continue; }
          const dir = Math.sign(other - xx) || 1;   // arrow pointing off the drawing
          dims.push(L('dim', xx, Y, xx + dir * t * 1.6, Y + t), L('dim', xx, Y, xx + dir * t * 1.6, Y - t));
        }
        const room = Math.abs(b - a) - f * 0.6;
        let s = full, fs = f;
        if (textW(s) > room) s = example ? name : value;
        if (textW(s) > room && textW(s) * 0.6 <= room) fs = f * room / textW(s);
        text.push(T(dimCls(d), (a + b) / 2, Y, s, { fs }));
      }
    }
    // dimensions drawn inside the drawing at their own height, such as a wall to the TV side
    for (const d of items.filter(i => i.t === 'dim' && i.side === 'inline')) {
      const Y = d.at, full = example ? d.name : d.name + ' ' + fmt(d.v), room = Math.abs(d.b - d.a) - f * 0.6;
      dims.push(L('dim', d.a, Y, d.b, Y), tick(d.a, Y), tick(d.b, Y));
      let s = full, fs = f * 0.9;
      if (textW(s, fs) > room) s = example ? d.name : fmt(d.v);
      if (textW(s, fs) > room) fs = Math.max(f * 0.55, fs * room / textW(s, fs));
      text.push(T(dimCls(d), (d.a + d.b) / 2, Y - fs * 0.75, s, { fs }));   // under the line, clear of the drill line above
    }

    const m = f * 1.2;
    const vb = { x: E.x0 - m, y: -(top + m), w: E.x1 - E.x0 + 2 * m, h: top - E.y0 + 2 * m };
    const defs = `<defs><pattern id="${hid}" patternUnits="userSpaceOnUse" width="1.6" height="1.6" patternTransform="rotate(45)"><line class="hl" x1="0" y1="0" x2="0" y2="1.6"/></pattern></defs>`;
    return { html: defs + back.join('') + mid.join('') + front.join('') + dims.join('') + text.join(''), vb };
  }

  // Pan, pinch and double-tap reset on an <svg> by moving its viewBox.
  function zoomer(svg, onTap) {
    const z = { base: null, k: 1, ox: 0, oy: 0 };
    const pts = new Map();
    let moved = 0, downAt = 0, lastTap = null, tapTimer = null;
    const view = () => { const b = z.base, w = b.w / z.k, h = b.h / z.k; return { x: b.x + b.w / 2 + z.ox - w / 2, y: b.y + b.h / 2 + z.oy - h / 2, w, h }; };
    const apply = () => { if (!z.base) return; const v = view(); svg.setAttribute('viewBox', `${N(v.x)} ${N(v.y)} ${N(v.w)} ${N(v.h)}`); };
    const unit = () => view().w / (svg.clientWidth || 1);
    function zoomAt(px, py, f) {
      const v = view(), u = v.w / (svg.clientWidth || 1);
      const P = { x: v.x + px * u, y: v.y + py * u };
      z.k = Math.max(0.6, Math.min(20, z.k * f));
      const w = z.base.w / z.k, h = z.base.h / z.k, u2 = w / (svg.clientWidth || 1);
      z.ox = P.x - px * u2 + w / 2 - (z.base.x + z.base.w / 2);
      z.oy = P.y - py * u2 + h / 2 - (z.base.y + z.base.h / 2);
      apply();
    }
    const pos = e => { const b = svg.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    svg.addEventListener('pointerdown', e => {
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      pts.set(e.pointerId, pos(e));
      if (pts.size === 1) { moved = 0; downAt = e.timeStamp; }
    });
    svg.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !z.base) return;
      const p = pos(e), prev = pts.get(e.pointerId);
      if (pts.size === 1) {
        const u = unit();
        z.ox -= (p.x - prev.x) * u; z.oy -= (p.y - prev.y) * u;
        moved += Math.hypot(p.x - prev.x, p.y - prev.y);
        pts.set(e.pointerId, p); apply();
      } else if (pts.size === 2) {
        const other = [...pts.entries()].find(([id]) => id !== e.pointerId)[1];
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(p.x - other.x, p.y - other.y);
        const m0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 }, m1 = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 };
        const u = unit();
        z.ox -= (m1.x - m0.x) * u; z.oy -= (m1.y - m0.y) * u;
        if (d0 > 2) zoomAt(m1.x, m1.y, d1 / d0); else apply();
        moved += 99;
        pts.set(e.pointerId, p);
      }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (pts.size || e.type === 'pointercancel') return;
      if (moved < 8 && e.timeStamp - downAt < 350) {
        if (lastTap && e.timeStamp - lastTap.t < 330 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 40) {
          clearTimeout(tapTimer); lastTap = null; reset(); buzz(6);
        } else {
          lastTap = { t: e.timeStamp, x: p.x, y: p.y };
          if (onTap) { clearTimeout(tapTimer); tapTimer = setTimeout(onTap, 340); }
        }
      }
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', e => { if (!z.base) return; e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0022)); }, { passive: false });
    svg.addEventListener('gesturestart', e => e.preventDefault());
    function reset() { z.k = 1; z.ox = 0; z.oy = 0; apply(); }
    function setBase(b) { z.base = b; apply(); }
    return { setBase, reset, z };
  }

  // Fit to the box's shape: grow the short side of the viewBox to match the element.
  function fitAspect(vb, cw, ch) {
    const a = cw / ch;
    if (vb.w / vb.h > a) { const h = vb.w / a; return { x: vb.x, y: vb.y - (h - vb.h) / 2, w: vb.w, h }; }
    const w = vb.h * a; return { x: vb.x - (w - vb.w) / 2, y: vb.y, w, h: vb.h };
  }

  function drawInto(svg, zm, sk, o) {
    const cw = svg.clientWidth || 360;
    const aspectH = vb => Math.max(220, Math.min(wide.matches ? Math.min(600, innerHeight * 0.62) : Math.min(470, innerHeight * 0.56), cw * vb.h / vb.w));
    let f = o.px * (sk.tv.x1 - sk.tv.x0) * 1.9 / cw, out;
    for (let i = 0; i < 3; i++) {
      out = sketchSVG(sk, f, o.example, o.hid, o.view);
      if (o.autoHeight) svg.style.height = Math.round(aspectH(out.vb)) + 'px';
      const ch = svg.clientHeight || 300;
      f = o.px / Math.min(cw / out.vb.w, ch / out.vb.h);
    }
    out = sketchSVG(sk, f, o.example, o.hid, o.view);
    svg.innerHTML = out.html;
    zm.setBase(fitAspect(out.vb, cw, svg.clientHeight || 300));
  }

  const zMain = zoomer($('#sk'));
  let lastTabId = null;
  function renderSketch() {
    const example = !r.sketch;
    const sk = example ? G.compute(EXAMPLE, { mode: 'simple' }).sketch : r.sketch;
    $('#skTag').textContent = example ? 'Example · fill in the TV and placement' : 'Pinch to zoom · double-tap to fit';
    if (lastTabId !== doc.current) { zMain.reset(); lastTabId = doc.current; }
    drawInto($('#sk'), zMain, sk, { px: 11.5, example, hid: 'hatchA', autoHeight: true });
  }
  $('#fitBtn').onclick = () => { zMain.reset(); buzz(6); };

  /* ---------- screenshot mode ---------- */
  let shot = null;
  function openShot() {
    closeKeypad(); closeSheet();
    const el = document.createElement('div');
    el.className = 'shot';
    el.innerHTML = '<div class="cap" id="shotCap"></div><div class="key" id="shotKey"></div><svg class="sk" id="shotSk" role="img" aria-label="Wall sketch"></svg><button class="x" id="shotX" aria-label="Close screenshot mode">✕</button>'
      + '<div class="seg vw" id="shotVw" role="group" aria-label="Screenshot for"><button data-v="client">Client</button><button data-v="crew">Installer</button></div>';
    document.body.appendChild(el);
    const x = el.querySelector('#shotX'), vw = el.querySelector('#shotVw');
    let hideT, down = null, revealedAt = -1e9;
    const show = on => { for (const c of [x, vw]) c.classList.toggle('gone', !on); };
    const peek = () => { show(true); clearTimeout(hideT); hideT = setTimeout(() => show(false), 3000); };
    // a tap anywhere, the caption and the empty corners too, brings the controls back at once;
    // a pan or pinch to frame the shot does not
    el.addEventListener('pointerdown', e => { down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: e.timeStamp, hidden: x.classList.contains('gone') } : null; });
    el.addEventListener('pointerup', e => {
      if (down && e.isPrimary && e.timeStamp - down.t < 500 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) {
        if (down.hidden) revealedAt = e.timeStamp;
        peek();
      }
      down = null;
    });
    // the tap that brings a control back does not also press it
    const fresh = e => e.timeStamp - revealedAt < 600;
    shot = { el, zm: zoomer(el.querySelector('#shotSk')) };
    x.onclick = e => { if (!fresh(e)) closeShot(); };
    vw.onclick = e => {
      const b = e.target.closest('[data-v]');
      if (!b || fresh(e)) return;
      peek();
      if (b.dataset.v === doc.settings.shot) return;
      doc.settings.shot = b.dataset.v; persist(); buzz(6);
      shot.zm.reset(); renderShot();
    };
    peek();
    renderShot();
  }
  function closeShot() { if (!shot) return; shot.el.remove(); shot = null; }
  // What each color means, for the installer view. Lists only what the sketch draws.
  function colorKey(items) {
    const has = f => items.some(f), dim = f => has(i => i.t === 'dim' && f(i));
    const sw = s => `<svg class="sk sw" viewBox="0 0 22 12" aria-hidden="true">${s}</svg>`;
    const ln = cls => `<line class="${cls}" x1="1" y1="6" x2="21" y2="6"/>`, bx = cls => `<rect class="${cls}" x="2" y="2" width="18" height="8"/>`;
    const tx = c => `<rect x="1" y="4" width="20" height="4" rx="2" style="fill:var(--${c})"/>`;
    const keys = [
      [has(i => i.cls === 'drill' || i.cls === 'hole') || dim(i => i.key === 'hole'), ln('drill') + '<circle class="hole" cx="11" cy="6" r="3"/>', 'Drill holes'],
      [has(i => i.cls === 'plate') || dim(i => i.key === 'chain'), bx('plate'), 'Wall plate and bracket'],
      [has(i => i.cls === 'stud'), ln('stud'), 'Studs'],
      [has(i => i.cls === 'center' || i.cls === 'markline') || dim(i => i.side === 'bottom'), ln('center'), 'Center line'],
      [dim(i => i.input), tx('orange'), 'Height you set'],
      [dim(i => i.key === 'tv'), tx('purple'), 'TV size'],
      [has(i => i.cls === 'sbar') || dim(i => /^bar/.test(i.key)), bx('sbar'), 'Soundbar'],
      [has(i => i.cls === 'mantle'), bx('mantle'), r.ref.kind === 'mantle' ? r.ref.noun[0].toUpperCase() + r.ref.noun.slice(1) : 'Mantle'],
      [has(i => i.cls === 'box'), bx('box'), 'Box'],
      [has(i => i.cls === 'zone'), bx('zone'), 'Room for the box'],
      [has(i => i.cls === 'built'), bx('built'), 'As built'],
      [has(i => i.cls === 'eye'), ln('eye'), 'Seated eye line']
    ];
    return keys.filter(k => k[0]).map(([, s, l]) => `<span>${sw(s)}${esc(l)}</span>`).join('');
  }
  function renderShot() {
    if (!shot) return;
    const t = tab(), example = !r.sketch, view = doc.settings.shot;
    shot.el.querySelectorAll('#shotVw button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
    const line = (s, cls) => `<span${cls ? ` class="${cls}"` : ''}>${esc(s)}</span>`;
    let cap = '';
    if (example) cap = line('Example');
    else if (view === 'client') {
      // where the TV goes, as the client reads it: heights above the finished floor, or from the mantle or ceiling
      const { kind, edge, label } = r.ref, b = r.bar && r.bar.top != null ? r.bar : null;
      const at = (o, k) => kind === 'floor' ? o.aff[k] : o.m[k];
      const ks = ['top', 'center', 'bottom'].filter(k => k !== edge && at(r, k) != null);
      if (edge === 'bar' && b) cap += line('Soundbar bottom ' + fmt(at(b, 'bottom')) + ' ' + label);
      else cap += line('TV ' + edge + ' ' + fmt(at(r, edge)) + ' ' + label);
      if (ks.length) cap += line((edge === 'bar' ? 'TV ' : '') + ks.map((k, i) => (i || edge === 'bar' ? k : k[0].toUpperCase() + k.slice(1)) + ' ' + fmt(at(r, k))).join(' · '), 'e');
      if (b) cap += line(b.kind === 'tv' ? 'Soundbar flush under the TV' : b.gap > 1e-9 ? 'Soundbar ' + fmt(b.gap) + ' below the TV' : 'Soundbar right under the TV', 'e');
    } else if (r.ok) {
      const edges = ['top', 'center', 'bottom'].filter(k => r.m[k] != null).map(k => k + ' ' + fmt(r.m[k])).join(' · ');
      cap += line('Drill top holes ' + fmt(r.rows[0].v) + ' ' + r.rows[0].sub);
      if (edges) cap += line('TV ' + edges, 'e');
      if (r.bar && r.bar.hole != null) cap += line('Soundbar holes ' + fmt(r.bar.m.hole), 'e');
    } else cap = line('Add the bracket to see where to drill');
    $('#shotCap').innerHTML = `<b>${esc(t.name)}</b>${cap}`;
    $('#shotKey').innerHTML = view === 'crew' && !example ? colorKey(r.sketch.items.filter(SHOWS.crew)) : '';
    drawInto(shot.el.querySelector('#shotSk'), shot.zm, example ? G.compute(EXAMPLE, { mode: 'simple' }).sketch : r.sketch, { px: Math.max(13, Math.min(22, Math.min(innerWidth, innerHeight) / 29)), example, hid: 'hatchB', view });
  }
  $('#shotBtn').onclick = openShot;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && shot) closeShot(); });

  /* ---------- tabs ---------- */
  function renderTabs() {
    const el = $('#tabs'), sl = el.scrollLeft;
    el.innerHTML = doc.tabs.map(t => `<button data-tab="${t.id}" class="${t.id === doc.current ? 'on' : ''}">${esc(t.name)}</button>`).join('')
      + '<button class="add" data-tab="+" aria-label="Add a TV location">+</button>';
    el.scrollLeft = sl;
  }
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    closeKeypad();
    const id = b.dataset.tab;
    if (id === '+') { S.addTab(doc); buzz(8); update(); scrollTabIntoView(); tabSheet(true); return; }
    if (id === doc.current) { tabSheet(); return; }
    doc.current = id; buzz(6); update(); scrollTabIntoView();
  });
  function scrollTabIntoView() { const on = $('#tabs .on'); if (on) on.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }

  function tabSheet(isNew) {
    const t = tab();
    const el = sheet(`<h2>${isNew ? 'New TV location' : 'TV location'}</h2>
      <input class="input" id="tabName" value="${esc(t.name)}" maxlength="40" autocomplete="off" enterkeyhint="done" aria-label="Name">
      <div class="stack">
        <button class="btn" data-act="copy">Copy as text</button>
        <button class="btn" data-act="dup">Duplicate</button>
        <button class="btn" data-act="clear">Clear sheet</button>
        <button class="danger" data-act="del">Delete</button>
      </div>`);
    const inp = el.querySelector('#tabName');
    const rename = () => { const v = inp.value.trim(); if (v && v !== t.name) { t.name = v; persist(); renderTabs(); } };
    inp.addEventListener('input', rename);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { rename(); closeSheet(); } });
    if (isNew) setTimeout(() => { inp.focus(); inp.select(); }, 60);
    let armed = false, armedClear = false;
    el.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'copy') { rename(); toast(await copy(tabText()) ? 'Copied' : 'Couldn’t copy'); }
      if (a === 'dup') { rename(); S.duplicateTab(doc, t.id); update(); closeSheet(); scrollTabIntoView(); toast('Duplicated'); }
      if (a === 'clear') {
        if (!armedClear) { armedClear = true; e.target.textContent = 'Tap again to clear ' + t.name; return; }
        rename(); const i = doc.tabs.indexOf(t); const n = Object.assign(G.newTab(t.name), { id: t.id }); doc.tabs[i] = n;
        update(); closeSheet(); toast('Cleared');
      }
      if (a === 'del') {
        if (!armed) { armed = true; e.target.textContent = 'Tap again to delete ' + t.name; return; }
        S.deleteTab(doc, t.id); update(); closeSheet(); toast('Deleted');
      }
    });
  }

  /* ---------- copy as text ---------- */
  function tabText() {
    const t = tab();
    const out = ['TV Mount · ' + t.name, (pro() ? 'Pro' : 'Simple') + ' mode · ' + (doc.settings.dec ? 'decimal inches' : 'rounded to 1/' + doc.settings.prec + '"'), ''];
    if (!r.ok) out.push('Not placed yet. ' + needText() + '.');
    for (const x of r.rows) {
      const v = x.s != null ? fill(x.s) : x.v != null ? fmt(x.v) : null;
      if (v == null) continue;
      out.push(x.k + ': ' + v + (x.sub ? ' ' + fill(x.sub) : '') + (x.alt ? ' (' + fill(x.alt) + ')' : ''));
    }
    if (r.warnings.length) { out.push(''); r.warnings.forEach(w => out.push('! ' + fill(w))); }
    const kind = t.ref.kind, k = t.ref[kind];
    out.push('', 'Inputs', 'Reference: ' + kind + ', ' + (G.EDGE_NAME[r.ref.edge] || '').toLowerCase());
    if (t.tv.src === 'size' && t.tv.size) out.push('TV size: ' + t.tv.size + '″ class (estimate)');
    if (pro() && t.tv.model) out.push('TV model: ' + t.tv.model);
    if (pro() && t.mount.model) out.push('Mount model: ' + t.mount.model);
    if (t.bar.kind !== 'none') out.push('Soundbar: ' + (t.bar.kind === 'tv' ? 'TV attachment' : t.bar.place === 'center' ? 'on the wall, centered' : 'on the wall'));
    for (const [path, lab] of formFields) {
      const v = get(t, path);
      if (isNum(v)) out.push(lab + ': ' + fmtIn(v));
    }
    return out.join('\n').replace(/\u00a0/g, ' ');
  }

  /* ---------- menu, saved items, backup ---------- */
  function menuSheet() {
    closeKeypad();
    const s = doc.settings;
    const segS = (key, opts) => `<div class="seg" data-set="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const el = sheet(`<h2>TV Mount</h2>
      <div class="label">Mode</div>${segS('mode', [['simple', 'Simple'], ['pro', 'Pro']])}
      ${themeSegHTML()}
      <div class="label">Round to</div>${segS('prec', [[8, '1/8'], [16, '1/16'], [32, '1/32']])}
      <div class="label">Show inches as</div>${segS('dec', [[false, 'Fractions'], [true, 'Decimals']])}
      <div class="stack">
        <button class="btn" data-act="shot">Screenshot mode</button>
        <button class="btn" data-act="copy">Copy this tab as text</button>
        <button class="btn" data-act="lib">Saved TVs and mounts</button>
        <button class="btn" data-act="export">Back up to a file</button>
        <button class="btn" data-act="import">Restore from a backup</button>
      </div>
      <p class="hint">Simple mode uses defaults for the pro values. Switching never loses what you entered.</p>${homeLinkHTML()}`);
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-set] button');
      if (b) {
        const key = b.parentElement.dataset.set;
        s[key] = key === 'prec' ? +b.dataset.v : key === 'dec' ? b.dataset.v === 'true' : b.dataset.v;
        b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        buzz(6); update(); return;
      }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'shot') openShot();
      if (a === 'copy') toast(await copy(tabText()) ? 'Copied' : 'Couldn’t copy');
      if (a === 'lib') libSheet('all');
      if (a === 'export') exportBackup();
      if (a === 'import') $('#importFile').click();
    });
  }
  $('#menuBtn').onclick = menuSheet;

  function itemSummary(kind, x) {
    if (kind === 'tv') return [x.w != null && x.h != null ? fmt(x.w) + ' × ' + fmt(x.h) : null, x.vesaTop != null ? 'VESA to top ' + fmt(x.vesaTop) : null].filter(Boolean).join(' · ');
    return [x.holesToTop != null ? 'holes to top ' + fmt(x.holesToTop) : null, x.holesToBottom != null ? 'holes to bottom ' + fmt(x.holesToBottom) : null, x.hookDrop != null ? 'hook ' + fmt(x.hookDrop) : null, x.armDrop != null ? 'arm ' + fmt(x.armDrop) : null, x.sag ? 'sag ' + fmt(x.sag) : null, x.slide != null ? 'slide ' + fmt(x.slide) : null].filter(Boolean).join(' · ');
  }
  /* ---------- shared library (Cloudflare Worker at /api/tvmount/lib) ----------
     doc.lib is the phone's copy. Items flagged local are not on the server yet. */
  const API = '/api/tvmount/lib', PASS = 'tvmount.pass', LISTS = ['tvs', 'mounts'];
  const norm = s => String(s || '').trim().toLowerCase();
  const getPass = () => { try { return localStorage.getItem(PASS) || ''; } catch (e) { return ''; } };
  const setPass = v => { try { v ? localStorage.setItem(PASS, v) : localStorage.removeItem(PASS); } catch (e) {} };
  async function api(method, path = '', body) {
    const res = await fetch(API + path, { method, cache: 'no-store', headers: Object.assign({ 'x-passcode': getPass() }, body ? { 'content-type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    if (res.status === 403) { setPass(''); throw Object.assign(new Error('passcode'), { pass: true }); }
    const j = await res.json().catch(() => null);
    if (!res.ok || !j) throw new Error('server');
    return j;
  }
  // Server list plus local items it does not have. Before the first sync every item is local.
  function setLib(srv) {
    if (!doc.lib.synced) for (const k of LISTS) doc.lib[k].forEach(x => { x.local = true; });
    const out = { synced: true };
    for (const k of LISTS) {
      const tpl = k === 'tvs' ? S.TV_ITEM : S.MOUNT_ITEM, list = Array.isArray(srv[k]) ? srv[k] : [];
      out[k] = list.filter(x => x && x.id).map(x => {
        const c = Object.assign({ id: String(x.id) }, S.conform(tpl, x));
        // An app from before millimeters saved VESA spacing in inches. No VESA size is under 40 mm.
        if (k === 'tvs') for (const f of ['vesaW', 'vesaH']) if (isNum(c[f]) && c[f] < 40) c[f] = S.vesaMm(c[f]);
        return c;
      }).concat(doc.lib[k].filter(x => x.local && !list.some(y => norm(y.model) === norm(x.model))));
    }
    doc.lib = out; persist();
  }
  function askPass() {
    return new Promise(done => {
      const el = sheet(`<h2>Passcode</h2>
        <input class="input" id="passIn" type="password" placeholder="Passcode" autocomplete="current-password" enterkeyhint="done">
        <p class="hint">Saved TVs and mounts are shared with everyone who uses this site. The passcode lets this phone change them.</p>
        <div class="stack"><button class="primary" data-act="ok">OK</button></div>`);
      const inp = el.querySelector('#passIn');
      setTimeout(() => inp.focus(), 60);
      const ok = () => { const v = inp.value.trim(); if (!v) return; setPass(v); closeSheet(); done(true); };
      el.addEventListener('click', e => { if (e.target.closest('[data-act="ok"]')) ok(); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      new MutationObserver((_, o) => { if (!el.isConnected) { o.disconnect(); done(!!getPass()); } }).observe(document.body, { childList: true });
    });
  }
  // Send local items to the server. Asks for the passcode once if this phone has none.
  async function pushLocal(ask) {
    const pending = () => LISTS.flatMap(k => doc.lib[k].filter(x => x.local).map(x => [k, x]));
    if (!pending().length) return true;
    if (!getPass() && !(ask && await askPass())) return false;
    try {
      for (const [k, x] of pending()) {
        const item = Object.assign({}, x); delete item.local;
        setLib((await api('PUT', '/' + (k === 'tvs' ? 'tv' : 'mount'), item)).lib);
      }
      return true;
    } catch (e) {
      toast(e.pass ? 'Wrong passcode' : 'Saved on this phone. It shares when the site can be reached.');
      return false;
    } finally { render(); }
  }
  async function syncLib() {
    try { setLib(await api('GET')); render(); await pushLocal(false); return true; } catch (e) { return false; }
  }

  function libSheet(kind) {
    const kinds = kind === 'all' ? ['tv', 'mount'] : [kind];
    const listFor = k => doc.lib[k === 'tv' ? 'tvs' : 'mounts'];
    const html = () => kinds.map(k => {
      const list = listFor(k);
      return `<div class="label">${k === 'tv' ? 'TVs' : 'Mounts'}</div>` + (list.length
        ? `<div class="libl">${list.map(x => `<div class="libi"><button class="use" data-use="${k}:${x.id}"><b>${esc(x.model || 'No model number')}</b><span>${esc(itemSummary(k, x))}</span></button><button class="ed" data-ren="${k}:${x.id}" aria-label="Rename">${PENCIL}</button><button class="del" data-del="${k}:${x.id}" aria-label="Delete">✕</button></div>`).join('')}</div>`
        : `<p class="hint">None saved yet. Fill in a ${k === 'tv' ? 'TV' : 'mount'} in Pro mode and tap Save.</p>`);
    }).join('');
    const el = sheet(`<h2>${kind === 'tv' ? 'Saved TVs' : kind === 'mount' ? 'Saved mounts' : 'Saved TVs and mounts'}</h2><div id="libBody">${html()}</div><p class="hint">Shared with everyone who uses this site.</p><p class="hint">Tap one to use it in “${esc(tab().name)}”.</p>`);
    const armed = new Set();
    syncLib().then(() => { if (el.isConnected && !armed.size) el.querySelector('#libBody').innerHTML = html(); });
    el.addEventListener('click', e => {
      const u = e.target.closest('[data-use]'), d = e.target.closest('[data-del]'), rn = e.target.closest('[data-ren]');
      if (rn) {
        const [k, id] = rn.dataset.ren.split(':'), x = listFor(k).find(i => i.id === id);
        if (x) renameSheet(k, x, kind);
        return;
      }
      if (u) {
        const [k, id] = u.dataset.use.split(':'), x = listFor(k).find(i => i.id === id);
        if (!x) return;
        if (k === 'tv') S.applyTV(tab(), x); else S.applyMount(tab(), x);
        if (!pro()) doc.settings.mode = 'pro';
        update(); closeSheet(); toast((x.model || 'Saved item') + ' applied');
      }
      if (d) {
        if (!armed.has(d.dataset.del)) { armed.add(d.dataset.del); d.textContent = 'Delete?'; d.style.width = 'auto'; d.style.padding = '0 10px'; return; }
        const [k, id] = d.dataset.del.split(':'), list = listFor(k), x = list.find(i => i.id === id);
        if (!x) return;
        const done = () => { render(); if (el.isConnected) el.querySelector('#libBody').innerHTML = html(); };
        if (x.local) { list.splice(list.indexOf(x), 1); persist(); done(); return; }
        (async () => {
          if (!getPass() && !await askPass()) return;
          try { setLib((await api('DELETE', '/' + k + '/' + encodeURIComponent(id))).lib); toast('Deleted for everyone'); }
          catch (err) { toast(err.pass ? 'Wrong passcode' : 'Couldn’t reach the site. Not deleted.'); }
          done();
        })();
      }
    });
  }
  // A new model number for a saved TV or mount. On the site that deletes the old entry and saves
  // the new one, so it takes the passcode. Tabs that use the old name get the new one.
  function renameSheet(k, x, back) {
    const what = k === 'tv' ? 'TV' : 'mount', key = k === 'tv' ? 'tvs' : 'mounts';
    const el = sheet(`<h2>Rename ${what}</h2>
      <input class="input" id="modelIn" value="${esc(x.model || '')}" placeholder="Model number" maxlength="60" autocomplete="off" autocapitalize="characters" enterkeyhint="done">
      <p class="hint">Changes the name for everyone who uses this site.</p>
      <div class="stack"><button class="primary" data-act="save">Rename</button></div>`);
    const inp = el.querySelector('#modelIn');
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
    const save = async () => {
      const model = inp.value.trim(), old = x.model;
      if (!model) { toast('Add the model number'); return; }
      if (model === old) { libSheet(back); return; }
      if (doc.lib[key].some(y => y !== x && norm(y.model) === norm(model))) { toast(model + ' is already saved'); return; }
      if (x.local) doc.lib[key].splice(doc.lib[key].indexOf(x), 1);
      else {
        if (!getPass() && !await askPass()) return;
        try { setLib((await api('DELETE', '/' + k + '/' + encodeURIComponent(x.id))).lib); }
        catch (err) { toast(err.pass ? 'Wrong passcode' : 'Couldn’t reach the site. Not renamed.'); return; }
      }
      // saved on this phone first; the list sends it to the site
      S.upsert(doc.lib[key], Object.assign({}, x, { model })).local = true;
      for (const t of doc.tabs) { const o = k === 'tv' ? t.tv : t.mount; if (norm(o.model) === norm(old)) o.model = model; }
      update(); libSheet(back); toast('Renamed to ' + model);
    };
    el.addEventListener('click', e => { if (e.target.closest('[data-act="save"]')) save(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  }
  function libSaveSheet(kind) {
    const t = tab(), cur = kind === 'tv' ? t.tv.model : t.mount.model;
    const el = sheet(`<h2>Save ${kind === 'tv' ? 'TV' : 'mount'}</h2>
      <input class="input" id="modelIn" value="${esc(cur || '')}" placeholder="Model number" maxlength="60" autocomplete="off" autocapitalize="characters" enterkeyhint="done">
      <p class="hint">${kind === 'tv' ? 'Saves the measured width, height and VESA holes.' : 'Saves the bracket chain, sag and plate values.'} An existing entry with the same model number is updated.</p>
      <div class="stack"><button class="primary" data-act="save">Save</button></div>`);
    const inp = el.querySelector('#modelIn');
    setTimeout(() => inp.focus(), 60);
    const save = () => {
      const model = inp.value.trim();
      if (!model) { toast('Add the model number'); return; }
      if (kind === 'tv') { t.tv.model = model; S.upsert(doc.lib.tvs, S.tvFromTab(t)).local = true; }
      else { t.mount.model = model; S.upsert(doc.lib.mounts, S.mountFromTab(t)).local = true; }
      update(); closeSheet();
      api('GET').then(srv => { setLib(srv); return pushLocal(true); })
        .then(ok => { if (ok) toast(model + ' saved for everyone'); }, () => toast(model + ' saved on this phone. It shares when the site can be reached.'));
    };
    el.addEventListener('click', e => { if (e.target.closest('[data-act="save"]')) save(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  }

  async function exportBackup() {
    const text = S.exportText(doc), name = 'tvmount-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    try {
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'TV Mount backup' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('Backup saved');
  }
  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let inc;
    try { inc = S.parseImport(await file.text()); } catch (err) { toast(err.message); return; }
    const n = (x, w) => x + ' ' + w + (x === 1 ? '' : 's');
    const el = sheet(`<h2>Restore backup</h2>
      <p class="hint" style="font-size:16px">${esc(file.name)} has ${n(inc.tabs.length, 'tab')}, ${n(inc.lib.tvs.length, 'saved TV')} and ${n(inc.lib.mounts.length, 'saved mount')}.</p>
      <div class="stack"><button class="primary" data-act="merge">Add to what’s here</button><button class="danger" data-act="replace">Replace everything</button></div>
      <p class="hint">Adding keeps your tabs; ones with the same id are updated from the backup.</p>`);
    let armed = false, armedClear = false;
    el.addEventListener('click', ev => {
      const a = ev.target.closest('[data-act]')?.dataset.act;
      if (a === 'merge') { doc = S.mergeDocs(doc, inc); update(); closeSheet(); toast('Backup added'); }
      if (a === 'replace') {
        if (!armed) { armed = true; ev.target.textContent = 'Tap again to replace everything'; return; }
        try { localStorage.setItem('tvmount.backup.before-restore', JSON.stringify(doc)); } catch (_) {}
        doc = S.replaceDoc(doc, inc); update(); closeSheet(); toast('Backup restored');
      }
    });
  });

  /* ---------- render ---------- */
  function render() {
    r = G.compute(tab(), { mode: doc.settings.mode });
    renderTabs();
    renderResults();
    renderForm();
    renderSketch();
    syncKeypad();
    if (shot) renderShot();
    $('h1').innerHTML = 'TV Mount' + (pro() ? ' <span class="pro">Pro</span>' : '');
  }

  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { padForKeypad(); renderSketch(); if (shot) renderShot(); }, 120); });
  addEventListener('storage', e => { if (e.key === S.KEY && e.newValue) { doc = S.load(localStorage).doc; render(); } });

  render();
  if (loaded.error) toast(loaded.error);
  else if (loaded.from != null) toast('Saved data updated');
  if ('caches' in window) caches.keys().then(k => { const v = k.find(x => x.startsWith('tvmount-')); $('#ver').textContent = 'Saved on this device' + (v ? ' · ' + v : ''); }).catch(() => {});
  else $('#ver').textContent = 'Saved on this device';
  syncLib();
  window.TVM = { get doc() { return doc; }, get r() { return r; }, render, text: () => tabText() };   // for checks from the console
})();
