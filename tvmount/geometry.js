/* TV Mount — the math. Plain functions, no DOM, no state.
   Every length is decimal inches. On the wall, x runs right from the TV's center line
   (as you face the wall) and y runs up from the reference line: the finished floor,
   the mantle top at the center line, or the ceiling.
   Browser: window.Geo. Node: require('./geometry.js'). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Geo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const isNum = v => typeof v === 'number' && isFinite(v);
  const EPS = 1e-9;
  const DEG = 180 / Math.PI;

  /* ---------- parsing and formatting ---------- */

  const VULGAR = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅓': '1/3', '⅔': '2/3' };

  // "48 3/8", "48-3/8", "48.375", "3/8", "4' 3/8", "5'-3 1/2\"" → inches. Blank → null, junk → NaN.
  function parseInches(input) {
    if (input == null) return null;
    if (typeof input === 'number') return isFinite(input) ? input : NaN;
    let s = String(input)
      .replace(/[½¼¾⅛⅜⅝⅞⅓⅔]/g, c => ' ' + VULGAR[c])
      .replace(/[″”“]|''/g, '"').replace(/[′’‘]/g, "'").replace(/[−–—]/g, '-')
      .replace(/\s+/g, ' ').trim();
    if (!s) return null;
    let sign = 1;
    if (s[0] === '-' || s[0] === '+') { if (s[0] === '-') sign = -1; s = s.slice(1).trim(); }
    const ft = s.match(/^(\d+(?:\.\d+)?|\.\d+)\s*(?:'|ft\.?|feet|foot)\s*-?\s*(.*)$/i);
    if (ft) {
      const rest = ft[2].trim();
      const inch = rest ? parseInches(rest) : 0;
      if (!isNum(inch) || inch < 0) return NaN;
      return sign * (parseFloat(ft[1]) * 12 + inch);
    }
    s = s.replace(/\s*(?:"|in\.?|inch(?:es)?)$/i, '').trim();
    let m;
    if ((m = s.match(/^(\d+)(?:\s+|\s*-\s*)(\d+)\s*\/\s*(\d+)$/))) return +m[3] ? sign * (+m[1] + m[2] / m[3]) : NaN;
    if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) return +m[2] ? sign * (m[1] / m[2]) : NaN;
    if ((m = s.match(/^(\d+\.?\d*|\.\d+)$/))) return sign * parseFloat(m[1]);
    return NaN;
  }

  // Round to the nearest 1/prec and write it as a tape reads: 48 3/8"
  function formatInches(x, o) {
    o = o || {};
    const prec = o.prec || 16, unit = o.unit == null ? '"' : o.unit;
    if (!isNum(x)) return '—';
    if (o.dec) {
      const places = prec >= 32 ? 3 : 2;
      let s = Math.abs(x).toFixed(places).replace(/\.?0+$/, '');
      const neg = x < 0 && +s !== 0;
      return (neg ? '−' : '') + s + unit;
    }
    const n = Math.round(Math.abs(x) * prec);
    const w = Math.floor(n / prec);
    let num = n % prec, den = prec;
    while (num && num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
    const neg = x < 0 && n !== 0;
    const body = num ? (w ? w + ' ' + num + '/' + den : num + '/' + den) : String(w);
    return (neg ? '−' : '') + body + unit;
  }

  // For values someone typed: show them exactly (down to 1/64) instead of rounding.
  function formatExact(x, o) {
    o = o || {};
    if (!isNum(x)) return '';
    for (const den of [1, 2, 4, 8, 16, 32, 64]) {
      if (Math.abs(x * den - Math.round(x * den)) < 1e-7) {
        if (o.dec) return formatInches(x, Object.assign({}, o, { dec: true, prec: den >= 32 ? 64 : 16 }));
        return formatInches(x, Object.assign({}, o, { dec: false, prec: Math.max(den, 1) }));
      }
    }
    const s = Math.abs(x).toFixed(3).replace(/\.?0+$/, '');
    return (x < 0 ? '−' : '') + s + (o.unit == null ? '"' : o.unit);
  }

  // Text templates carry inch values as {12.375}; the app fills them with its own rounding.
  const T = v => '{' + v + '}';
  function fill(s, fmt) { return String(s).replace(/\{(-?\d+(?:\.\d+)?(?:e-?\d+)?)\}/g, (_, n) => fmt(+n)); }

  /* ---------- TV sizes ---------- */

  const SIZES = [43, 50, 55, 65, 75, 77, 83, 85, 98];
  const BEZEL = { w: 0.5, h: 0.9 };   // typical overall size beyond a 16:9 screen
  function sizeEstimate(diag) {
    if (!isNum(diag) || diag <= 0) return null;
    const k = diag / Math.hypot(16, 9);
    return { w: 16 * k + BEZEL.w, h: 9 * k + BEZEL.h };
  }

  /* ---------- the data model for one TV location ---------- */

  const EDGE = { floor: 'bottom', mantle: 'bottom', ceiling: 'bottom' };   // every placement starts on the TV bottom
  const KINDS = ['floor', 'mantle', 'ceiling'];

  function newTab(name) {
    return {
      name: name || 'TV',
      tv: { src: 'size', w: null, h: null, size: null, model: '', vesaTop: null, vesaW: null, vesaH: null },
      mount: {
        model: '', holesFrom: 'top', holesToTop: null, holesToBottom: null, chain: 'measured', hookDrop: null, armDrop: null, sag: null,
        plateW: null, plateH: null, holeDown: null, rowGap: null, lagSpan: null, slide: null,
        adjUp: null, adjDown: null, studsNeeded: null
      },
      ref: {
        kind: 'floor', ff: null,
        floor: { edge: 'bottom', value: null },
        mantle: { what: 'mantle', edge: 'bottom', value: null, h: null, hR: null, len: null },
        ceiling: { edge: 'bottom', value: null, h: null }
      },
      center: { mode: 'half', from: 'left', a: null, b: null, d: null },
      studs: { from: 'center', list: [] },
      box: { on: false, place: 'auto', w: null, h: null, margin: null, corner: 'bl', side: 'left', cornerH: null, cornerX: null },
      view: { eye: null, dist: null },
      built: { top: null, bottom: null },
      bar: { kind: 'none', w: null, h: null, place: 'gap', gap: null, below: null, holesToTop: null },
      room: { ceil: null, mantle: null, left: null, right: null }   // sketch only: heights from the floor, walls from the center line
    };
  }

  // Defaults that stand in for pro values in Simple mode, or when a pro field is blank.
  const DEFAULTS = { sag: 0, ff: 0, slide: 0, holeDown: 0, boxMargin: 2, eye: 40, studWidth: 1.5, barGap: 2, lagInset: 1, armWidth: 1.5 };

  // With a soundbar under the TV, the bottom edge you measure to is the soundbar's bottom.
  function edgeOf(edge, kind, sb) {
    const ed = ['top', 'center', 'bottom'].includes(edge) ? edge : EDGE[kind];
    return ed === 'bottom' && sb && (sb.kind === 'wall' || sb.kind === 'tv') ? 'bar' : ed;
  }

  // The numbers compute() actually uses. Simple mode swaps every pro value for its default.
  function effective(tab, mode) {
    const pro = mode === 'pro';
    const t = tab || {}, tv = t.tv || {}, m = t.mount || {}, rf = t.ref || {};
    const kind = KINDS.includes(rf.kind) ? rf.kind : 'floor';
    const k = rf[kind] || {}, c = t.center || {}, st = t.studs || {}, bx = t.box || {}, vw = t.view || {}, b = t.built || {}, sb = t.bar || {}, rm = t.room || {};
    const n = v => isNum(v) ? v : null;
    const p = (v, d) => pro && isNum(v) ? v : (d === undefined ? null : d);
    return {
      mode: pro ? 'pro' : 'simple',
      tvSrc: tv.src === 'size' ? 'size' : 'measured', w: n(tv.w), h: n(tv.h), size: n(tv.size), model: pro ? (tv.model || '') : '',
      vesaTop: p(tv.vesaTop), vesaW: p(tv.vesaW), vesaH: p(tv.vesaH),
      chain: pro && m.chain === 'split' ? 'split' : 'measured',
      holesFrom: m.holesFrom === 'bottom' ? 'bottom' : 'top', holesToTop: n(m.holesToTop), holesToBottom: n(m.holesToBottom), hookDrop: p(m.hookDrop), armDrop: p(m.armDrop), sag: p(m.sag, DEFAULTS.sag),
      mountModel: pro ? (m.model || '') : '',
      plateW: p(m.plateW), plateH: p(m.plateH), holeDown: p(m.holeDown), rowGap: p(m.rowGap),
      lagSpan: p(m.lagSpan), slide: p(m.slide), adjUp: p(m.adjUp), adjDown: p(m.adjDown), studsNeeded: p(m.studsNeeded),
      kind, edge: edgeOf(k.edge, kind, sb), value: n(k.value),
      counter: kind === 'mantle' && rf.mantle && rf.mantle.what === 'counter',   // a countertop works like a mantle
      ff: p(rf.ff, DEFAULTS.ff),
      mantleH: kind === 'mantle' ? n(k.h) : null,
      mantleR: kind === 'mantle' ? p(k.hR) : null,
      mantleLen: kind === 'mantle' ? p(k.len) : null,
      ceilH: kind === 'ceiling' ? n(k.h) : null,
      center: { mode: c.mode === 'half' ? 'half' : 'two', from: c.mode !== 'half' && c.from === 'right' ? 'right' : 'left', a: n(c.a), b: n(c.b), d: n(c.d) },
      studsFrom: st.from === 'edge' ? 'edge' : 'center',
      studs: pro && Array.isArray(st.list) ? st.list.filter(isNum) : [],
      box: pro && bx.on ? { place: bx.place === 'set' ? 'set' : 'auto', w: n(bx.w), h: n(bx.h), margin: isNum(bx.margin) ? bx.margin : DEFAULTS.boxMargin, corner: ['bl', 'br', 'tl', 'tr'].includes(bx.corner) ? bx.corner : 'bl', side: bx.side === 'right' ? 'right' : 'left', cornerH: n(bx.cornerH), cornerX: isNum(bx.cornerX) ? Math.abs(bx.cornerX) : 0 } : null,
      eye: p(vw.eye, DEFAULTS.eye), dist: p(vw.dist),
      built: pro ? { top: n(b.top), bottom: n(b.bottom) } : null,
      room: { ceil: n(rm.ceil), mantle: n(rm.mantle), left: n(rm.left), right: n(rm.right) },
      // soundbar: kind wall = its own bracket, tv = an attachment that holds it flush under the TV
      bar: sb.kind === 'wall' || sb.kind === 'tv' ? {
        kind: sb.kind, w: n(sb.w), h: n(sb.h),
        place: sb.kind === 'wall' && sb.place === 'center' ? 'center' : 'gap',
        gap: sb.kind === 'tv' ? 0 : isNum(sb.gap) ? sb.gap : DEFAULTS.barGap,
        below: n(sb.below), holesToTop: sb.kind === 'wall' ? n(sb.holesToTop) : null
      } : null
    };
  }

  /* ---------- small tools ---------- */

  // Center between two marks measured from one edge, or half of one distance. Half a distance
  // is the same from either end; it counts from the left, for studs measured from the edge.
  function centerTool(c) {
    if (!c) return null;
    const from = c.mode !== 'half' && c.from === 'right' ? 'right' : 'left';
    if (c.mode === 'half') return isNum(c.d) ? { mode: 'half', from, pos: c.d / 2, d: c.d } : null;
    if (isNum(c.a) && isNum(c.b)) return { mode: 'two', from, pos: (c.a + c.b) / 2, a: c.a, b: c.b, half: Math.abs(c.b - c.a) / 2 };
    return null;
  }

  // Studs on a regular spacing through one known stud, kept within [lo, hi].
  function fillStuds(known, spacing, lo, hi) {
    if (!isNum(known) || !isNum(spacing) || spacing <= 0) return [];
    const out = [];
    for (let s = known - Math.floor((known - lo) / spacing) * spacing; s <= hi + EPS; s += spacing) out.push(Math.round(s * 1e6) / 1e6);
    return out;
  }

  // Where can the wall plate go? Its lag span must cover `need` studs, and the TV's VESA
  // center must stay within the plate's lateral slide. Picks the spot using the least slide.
  function slideCheck(studs, vesaX, lagSpan, slide, need) {
    const half = lagSpan / 2, tol = 1e-6;
    const inSpan = P => studs.filter(s => Math.abs(s - P) <= half + tol);
    const cands = [vesaX];
    for (const s of studs) cands.push(s - half, s + half);
    let best = null;
    for (const P of cands) {
      const hits = inSpan(P);
      if (hits.length < need) continue;
      const d = Math.abs(P - vesaX);
      if (!best || d < best.d - tol || (Math.abs(d - best.d) <= tol && hits.length > best.hits.length)) best = { P, d, hits };
    }
    if (!best) return { ok: false, P: null, need, hits: [], reason: 'span', slide, lagSpan };
    const used = vesaX - best.P;   // where the TV sits relative to the plate center (+ = right)
    const ok = best.d <= slide + tol;
    return {
      ok, P: best.P, need, hits: best.hits, used, slide, lagSpan,
      short: ok ? 0 : best.d - slide,
      left: ok ? slide + used : null, right: ok ? slide - used : null,
      reason: ok ? null : 'slide'
    };
  }

  /* ---------- the whole result ---------- */

  const REF_LABEL = { floor: 'above floor', mantle: 'above mantle', ceiling: 'below ceiling' };
  const EDGE_NAME = { top: 'TV top', center: 'TV center', bottom: 'TV bottom', bar: 'Soundbar bottom' };
  const FIELD_NAME = {
    'tv.w': 'TV width', 'tv.h': 'TV height', 'tv.size': 'TV size', 'tv.vesaTop': 'VESA to TV top',
    'mount.holesToTop': 'holes to TV top', 'mount.holesToBottom': 'holes to TV bottom', 'mount.hookDrop': 'plate holes to hook', 'mount.armDrop': 'arm hook to VESA',
    'ref.floor.value': 'target height', 'ref.mantle.value': 'gap above mantle', 'ref.ceiling.value': 'gap below ceiling',
    'ref.ceiling.h': 'ceiling height', 'bar.h': 'soundbar height'
  };

  function compute(tab, opts) {
    const e = effective(tab, opts && opts.mode);
    const pro = e.mode === 'pro';
    const r = { mode: e.mode, e, missing: [], warnings: [] };
    const miss = k => { if (!r.missing.includes(k)) r.missing.push(k); };

    /* TV size */
    let W = null, H = null, est = false;
    if (e.tvSrc === 'size') {
      const s = sizeEstimate(e.size);
      if (s) { W = s.w; H = s.h; est = true; } else miss('tv.size');
    } else {
      if (isNum(e.w) && e.w > 0) W = e.w;
      if (isNum(e.h) && e.h > 0) H = e.h;
    }
    r.tv = { w: W, h: H, est, size: est ? e.size : null, model: e.model };

    /* holes → TV top, once hung */
    let h2t = null;
    if (e.chain === 'split') {
      if (!isNum(e.vesaTop)) miss('tv.vesaTop');
      if (!isNum(e.hookDrop)) miss('mount.hookDrop');
      if (!isNum(e.armDrop)) miss('mount.armDrop');
      if (isNum(e.vesaTop) && isNum(e.hookDrop) && isNum(e.armDrop)) h2t = e.vesaTop - e.hookDrop - e.armDrop;
    } else if (e.holesFrom === 'bottom') {             // top holes down to the TV bottom: the rest of the height is above
      if (!isNum(e.holesToBottom)) miss('mount.holesToBottom');
      else if (H != null) h2t = H - e.holesToBottom;
      else if (e.tvSrc === 'measured') miss('tv.h');
    } else if (isNum(e.holesToTop)) h2t = e.holesToTop;
    else miss('mount.holesToTop');
    const hung = h2t == null ? null : h2t - e.sag;
    const from = e.chain === 'split' ? null : e.holesFrom;
    r.chain = { mode: e.chain, from, measured: h2t, sag: e.sag, hung, vesaTop: e.vesaTop, hookDrop: e.hookDrop, armDrop: e.armDrop, toBottom: e.holesToBottom };

    /* reference */
    const kind = e.kind, edge = e.edge;
    let refNow = null, slope = 0, rise = 0, span = null, L = null, R = null;
    if (kind === 'floor') refNow = e.ff;
    else if (kind === 'ceiling') refNow = e.ceilH;
    else {
      L = isNum(e.mantleH) ? e.mantleH : e.mantleR;
      R = isNum(e.mantleR) ? e.mantleR : L;
      if (isNum(L)) {
        refNow = (L + R) / 2;                                   // mantle top at the TV center line
        span = isNum(e.mantleLen) && e.mantleLen > 0 ? e.mantleLen : W;  // ends measured at the TV edges unless a length is given
        if (span && Math.abs(R - L) > EPS) {
          slope = (R - L) / span;
          rise = Math.abs(slope) * Math.min(W || span, span) / 2;   // center line up to the high point under the TV
        }
      }
    }
    const noun = e.counter ? 'countertop' : 'mantle';
    r.ref = { kind, edge, value: e.value, refNow, ff: e.ff, label: kind === 'mantle' ? 'above ' + noun : REF_LABEL[kind], noun, short: e.counter ? 'counter' : 'mantle', topName: e.counter ? 'countertop' : 'mantle top', L, R, slope, rise, span };
    const yOfAff = f => refNow == null ? null : f + e.ff - refNow;
    const under = e.bar ? barUnder(e.bar, r.ref, yOfAff) : null;

    /* vertical positions, y up from the reference line */
    let yEdge = null;
    if (isNum(e.value)) yEdge = kind === 'ceiling' ? -e.value : kind === 'mantle' ? e.value + (edge === 'bar' ? under.y : rise) : e.value;
    else miss('ref.' + kind + '.value');
    if (edge !== 'top' && H == null && e.tvSrc === 'measured') miss('tv.h');
    // measured to the soundbar bottom: up the bar and its gap to the TV bottom
    let barUp = null;
    if (edge === 'bar') {
      const B = e.bar;
      if (!isNum(B.h) || B.h <= 0) miss('bar.h');
      else if (B.place !== 'center') barUp = B.h + B.gap;
      else if (!under) miss('ref.ceiling.h');
      else if (yEdge != null) barUp = B.h + yEdge - under.y;   // centered: the same gap above as below
    }
    let top = null;
    if (yEdge != null) {
      if (edge === 'top') top = yEdge;
      else if (edge === 'bar') { if (H != null && barUp != null) top = yEdge + barUp + H; }
      else if (H != null) top = yEdge + (edge === 'center' ? H / 2 : H);
    }
    const y = {
      top,
      center: top != null && H != null ? top - H / 2 : null,
      bottom: top != null && H != null ? top - H : null,
      hole: top != null && hung != null ? top - hung : null
    };
    r.y = y;

    // what you read on the tape from the reference, and heights above the finished floor
    const measure = v => v == null ? null : kind === 'floor' ? v + e.ff : kind === 'ceiling' ? -v : v;
    const fromMeasure = v => !isNum(v) ? null : kind === 'floor' ? v - e.ff : kind === 'ceiling' ? -v : v;
    const aff = v => v == null || refNow == null ? null : refNow + v - e.ff;
    r.m = {}; r.aff = {};
    for (const k of ['hole', 'top', 'center', 'bottom']) { r.m[k] = measure(y[k]); r.aff[k] = aff(y[k]); }
    r.floorKnown = refNow != null;
    r.toMeasure = measure;
    r.toY = { fromMeasure, yOfAff };

    /* reference checks */
    if (kind === 'mantle' && y.bottom != null) {
      const at = x => span ? slope * Math.max(-span / 2, Math.min(span / 2, x)) : 0;
      r.ref.gapL = W ? y.bottom - at(-W / 2) : null;
      r.ref.gapR = W ? y.bottom - at(W / 2) : null;
      const gap = y.bottom - rise;
      r.ref.gap = gap;
      if (gap < -EPS) r.warnings.push('TV bottom is ' + T(-gap) + ' below the ' + r.ref.topName + '.');
    }
    if (kind === 'ceiling' && y.top != null) {
      r.ref.gap = -y.top;
      if (y.top > EPS) r.warnings.push('TV top is ' + T(y.top) + ' above the ceiling.');
    }
    if (r.aff.bottom != null && r.aff.bottom < -EPS) r.warnings.push('TV bottom is below the floor.');
    if (hung != null && hung < -EPS) r.warnings.push('Top holes sit ' + T(-hung) + ' above the TV top, so the plate may show.');

    /* horizontal */
    const ct = centerTool(e.center);
    r.center = ct;
    const vesaX = 0;   // VESA holes are always centered left to right on the TV
    // VESA spacing is typed in millimeters; the sketch works in inches.
    r.vesa = isNum(e.vesaW) ? { x: 0, w: e.vesaW / 25.4, h: isNum(e.vesaH) ? e.vesaH / 25.4 : null } : null;

    let studs = [];
    if (e.studs.length) {
      if (e.studsFrom === 'edge') {
        if (ct) studs = e.studs.map(s => ct.from === 'right' ? ct.pos - s : s - ct.pos);
        else r.warnings.push('Studs are measured from the edge. Fill in the center tool to place them.');
      } else studs = e.studs.slice();
      studs.sort((a, b) => a - b);
    }
    r.studs = studs;

    // Lag slots stop a little short of the plate ends. When the mount's slide is blank, the TV's
    // arms ride the plate rails: the plate can sit off center as long as both arms stay on it.
    const lag = isNum(e.plateW) ? Math.max(0, e.plateW - 2 * DEFAULTS.lagInset) : null;
    let slide = DEFAULTS.slide, slideFrom = 'none';
    if (isNum(e.slide)) { slide = e.slide; slideFrom = 'mount'; }
    else if (isNum(e.plateW)) {
      const arms = r.vesa ? r.vesa.w + DEFAULTS.armWidth : DEFAULTS.armWidth;
      slide = Math.max(0, (e.plateW - arms) / 2);
      slideFrom = r.vesa ? 'plate' : 'plate-novesa';
    }
    r.slide = null;
    if (pro && studs.length && lag) {
      const need = isNum(e.studsNeeded) && e.studsNeeded >= 1 ? Math.round(e.studsNeeded) : lag >= 16 ? 2 : 1;
      r.slide = slideCheck(studs, vesaX, lag, slide, need);
      r.slide.from = slideFrom;
      if (!r.slide.ok && r.slide.reason === 'span') r.warnings.push('The plate can’t reach ' + need + ' studs. Add blocking or a wider plate.');
      if (!r.slide.ok && r.slide.reason === 'slide') r.warnings.push('Lagging into studs needs ' + T(r.slide.short) + ' more slide than the ' + (slideFrom === 'mount' ? 'mount has.' : 'plate allows.'));
    }
    const P = r.slide && r.slide.P != null ? r.slide.P : vesaX;
    r.plateX = P;

    const holeRows = y.hole == null ? [] : [y.hole].concat(isNum(e.rowGap) && e.rowGap > 0 ? [y.hole - e.rowGap] : []);
    r.holeRows = holeRows;
    // lag holes go on the studs the plate reaches, even when the TV can't slide far enough (drawn hollow)
    r.drill = r.slide && r.slide.P != null ? r.slide.hits.flatMap(x => holeRows.map(yy => ({ x, y: yy, ok: r.slide.ok }))) : [];

    r.plate = null;
    if (y.hole != null && isNum(e.plateW) && isNum(e.plateH)) {
      const pTop = y.hole + (isNum(e.holeDown) ? e.holeDown : DEFAULTS.holeDown);
      r.plate = { x0: P - e.plateW / 2, x1: P + e.plateW / 2, y0: pTop - e.plateH, y1: pTop };
      if (y.top != null && pTop > y.top + EPS && !(hung < -EPS)) r.warnings.push('The plate reaches ' + T(pTop - y.top) + ' above the TV top.');
    }

    r.adjust = null;
    if (pro && (isNum(e.adjUp) || isNum(e.adjDown) || isNum(e.slide))) {
      const lr = r.slide ? (r.slide.ok ? [r.slide.left, r.slide.right] : [null, null]) : isNum(e.slide) ? [e.slide, e.slide] : [null, null];
      r.adjust = { up: e.adjUp, down: e.adjDown, left: lr[0], right: lr[1] };
    }

    /* recessed box zone */
    r.box = null;
    const bw = e.box && isNum(e.box.w) && e.box.w > 0 ? e.box.w : null, bh = e.box && isNum(e.box.h) && e.box.h > 0 ? e.box.h : null;
    if (e.box && e.box.place === 'set') {
      // already in the wall: report where it sits against the TV, the plate and the studs
      r.box = { set: true, zones: [], at: null, w: bw, h: bh, shows: [] };
      // measured to one corner: its height, and how far it sits left or right of the center line
      const yc = fromMeasure(e.box.cornerH), c = e.box.corner;
      if (bw && bh && yc != null) {
        const xc = (e.box.side === 'left' ? -1 : 1) * e.box.cornerX, x0 = c[1] === 'l' ? xc : xc - bw, y0 = c[0] === 'b' ? yc : yc - bh;
        const b = r.box.at = { where: 'set', x: x0 + bw / 2, x0, x1: x0 + bw, y0, y1: y0 + bh, cy: y0 + bh / 2 };
        if (W && y.top != null && y.bottom != null) {
          r.box.tvKnown = true;
          const out = [['above', b.y1 - y.top], ['below', y.bottom - b.y0], ['left of', -W / 2 - b.x0], ['right of', b.x1 - W / 2]];
          r.box.shows = out.filter(([, d]) => d > EPS).map(([k, d]) => ({ k, d }));
          if (r.box.shows.length) r.warnings.push('The box shows ' + r.box.shows.map(s => T(s.d) + ' ' + s.k).join(' and ') + ' the TV.');
        }
        if (studs.some(s => s + 0.75 > b.x0 + EPS && s - 0.75 < b.x1 - EPS)) r.warnings.push('The box crosses a stud mark. Check the stud and box positions.');
      }
    } else if (e.box && W && y.top != null && y.bottom != null) {
      const m = e.box.margin;
      const x0 = -W / 2 + m, x1 = W / 2 - m;
      // anywhere behind the TV. Half the box goes past an edge of the plate, so the plate
      // covers only half of it: centered on the plate bottom, else its top, else the TV center.
      const zones = [{ where: 'behind', x0, x1, y0: y.bottom + m, y1: y.top - m }];
      const lowRow = holeRows.length ? holeRows[holeRows.length - 1] : y.hole;
      const pBot = r.plate ? r.plate.y0 : lowRow != null ? lowRow - 1 : null;
      const pTop = r.plate ? r.plate.y1 : y.hole != null ? y.hole + 1 : null;
      const spots = [[pBot, 'below'], [pTop, 'above'], [y.center, null]].filter(s => s[0] != null);
      const ok = zones.filter(z => z.y1 - z.y0 > EPS && z.x1 - z.x0 > EPS);
      r.box = { zones: ok, at: null, fits: null, w: e.box.w, h: e.box.h, margin: m };
      if (isNum(e.box.w) && isNum(e.box.h) && e.box.w > 0 && e.box.h > 0) {
        r.box.fits = false;
        for (const z of ok) {
          if (z.y1 - z.y0 + EPS < e.box.h) continue;
          const x = placeInBay(studs, z.x0, z.x1, e.box.w);
          if (x == null) continue;
          const fit = spots.find(([c]) => c - e.box.h / 2 >= z.y0 - EPS && c + e.box.h / 2 <= z.y1 + EPS);
          const yb = fit ? fit[0] - e.box.h / 2 : Math.max(z.y0, Math.min(z.y1 - e.box.h, y.center - e.box.h / 2));
          r.box.at = { where: z.where, half: fit ? fit[1] : null, x, x0: x - e.box.w / 2, x1: x + e.box.w / 2, y0: yb, y1: yb + e.box.h, cy: yb + e.box.h / 2 };
          r.box.fits = true;
          break;
        }
        if (!r.box.fits) r.warnings.push('The box doesn’t fit behind the TV' + (studs.length ? ' between studs.' : '.'));
      }
    }

    /* viewing angle */
    r.view = null;
    if (pro && isNum(e.dist) && e.dist > 0) {
      if (y.center == null) r.view = { need: 'position' };
      else if (refNow == null) r.view = { need: 'floor' };
      else {
        const eyeY = yOfAff(e.eye);
        const ang = v => Math.atan2(v - eyeY, e.dist) * DEG;
        const c = ang(y.center);
        r.view = {
          eye: e.eye, eyeY, dist: e.dist, center: c, top: ang(y.top), bottom: ang(y.bottom),
          fov: W ? 2 * Math.atan(W / 2 / e.dist) * DEG : null,
          rating: c > 30 ? 'bad' : c > 15 ? 'high' : c < -15 ? 'low' : 'good',
          maxCenter: e.eye + e.dist * Math.tan(15 / DEG),   // above finished floor
          tilt: Math.max(0, c)
        };
        if (c > 30) r.warnings.push('Center is ' + Math.round(c) + '° above seated eye level. Past 30° strains necks.');
      }
    }

    /* as built */
    r.built = null;
    if (e.built && (isNum(e.built.top) || isNum(e.built.bottom)) && y.top != null) {
      const at = fromMeasure(e.built.top), ab = fromMeasure(e.built.bottom);
      const dTop = at == null ? null : at - y.top;
      const dBot = ab == null || y.bottom == null ? null : ab - y.bottom;
      const ds = [dTop, dBot].filter(isNum);
      const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
      const hMeas = at != null && ab != null ? at - ab : null;
      r.built = {
        top: at, bottom: ab, dTop, dBot, avg, hMeas,
        hErr: hMeas != null && H ? hMeas - H : null,
        sag: e.sag - avg   // the sag that would have predicted what you measured
      };
    }

    r.bar = barFor(e, y, r, under);

    r.ok = y.hole != null;
    r.rows = rowsFor(r);
    r.sketch = sketchFor(r);
    return r;
  }

  // What a soundbar hangs over: the mantle top (its high point under the bar), a console top
  // when it is centered over one, or the floor. Null when the floor height is unknown.
  function barUnder(B, ref, yOfAff) {
    if (ref.kind === 'mantle') return { what: 'mantle', y: Math.abs(ref.slope) * Math.min(B.w > 0 ? B.w : 0, ref.span || 0) / 2 };
    if (ref.refNow == null) return null;
    if (B.place === 'center' && isNum(B.below)) return { what: 'console', y: yOfAff(B.below) };
    return { what: 'floor', y: yOfAff(0) };
  }

  // A soundbar under the TV, centered on the TV center line. Its top sits a gap below the TV
  // bottom, or (on the wall) halfway between the TV and the surface below it.
  function barFor(e, y, r, under) {
    const B = e.bar;
    if (!B) return null;
    const ref = r.ref, b = { kind: B.kind, place: B.place, w: B.w && B.w > 0 ? B.w : null, h: B.h, need: [], under };
    if (!isNum(B.h) || B.h <= 0) b.need.push('height');
    if (y.bottom == null) b.need.push('position');
    if (B.place === 'center' && !under) b.need.push('floor');
    if (b.need.length) return b;

    b.gap = B.place === 'center' ? (y.bottom - under.y - B.h) / 2 : B.gap;
    b.top = y.bottom - b.gap;
    b.bottom = b.top - B.h;
    b.hole = isNum(B.holesToTop) ? b.top - B.holesToTop : null;
    b.clear = under ? b.bottom - under.y : null;
    if (B.place === 'center' && ref.edge !== 'bar' && b.gap < -EPS) r.warnings.push('The soundbar needs ' + T(-2 * b.gap) + ' more room between the TV and the ' + under.what + '.');
    else if (b.clear != null && b.clear < -EPS) r.warnings.push('Soundbar bottom is ' + T(-b.clear) + ' below the ' + (under.what === 'floor' ? 'floor.' : under.what + ' top.'));
    b.m = {}; b.aff = {};
    for (const k of ['hole', 'top', 'bottom']) { b.m[k] = r.toMeasure(b[k]); b.aff[k] = b[k] == null || ref.refNow == null ? null : ref.refNow + b[k] - ref.ff; }
    return b;
  }

  // Bays between studs (a stud is 1 1/2" wide); returns the box center nearest the center line.
  function placeInBay(studs, lo, hi, w) {
    const half = DEFAULTS.studWidth / 2;
    const edges = [-Infinity].concat(studs, [Infinity]);
    let best = null;
    for (let i = 0; i < edges.length - 1; i++) {
      const a = Math.max(lo, edges[i] + half), b = Math.min(hi, edges[i + 1] - half);
      if (b - a + EPS < w) continue;
      const x = Math.max(a + w / 2, Math.min(b - w / 2, 0));
      if (best == null || Math.abs(x) < Math.abs(best)) best = x;
    }
    return best;
  }

  /* ---------- rows for the results card and the text copy ---------- */

  const cap = s => s[0].toUpperCase() + s.slice(1);
  function side(x) { return Math.abs(x) < 1e-6 ? 'on center' : T(Math.abs(x)) + (x < 0 ? ' left' : ' right'); }
  const offLine = x => Math.abs(x) < 1e-6 ? 'centered on the center line' : side(x) + ' of center line';

  function rowsFor(r) {
    const rows = [], { y, m, ref, tv, chain } = r;
    const ffNow = ref.kind === 'floor' && Math.abs(ref.ff) > EPS;
    const sub = ffNow ? 'above floor now' : ref.label;
    const alt = k => {
      if (ffNow && r.aff[k] != null) return T(r.aff[k]) + ' above finished floor';
      if (ref.kind !== 'floor' && r.aff[k] != null) return T(r.aff[k]) + ' above floor';
      return '';
    };
    rows.push({ id: 'hole', k: 'Drill top holes', v: m.hole, sub, alt: alt('hole'), cls: 'hero' });
    if (r.holeRows.length > 1) {
      const low = r.holeRows[1], a = r.aff.hole != null && (ffNow || ref.kind !== 'floor') ? r.aff.hole - (y.hole - low) : null;
      rows.push({ id: 'hole2', k: 'Drill lower holes', v: r.toMeasure(low), sub, alt: T(y.hole - low) + ' below the top holes' + (a != null ? ', ' + T(a) + ' above ' + (ffNow ? 'finished ' : '') + 'floor' : '') });
    }
    rows.push({ id: 'top', k: 'TV top', v: m.top, sub, alt: alt('top') });
    rows.push({ id: 'center', k: 'TV center', v: m.center, sub, alt: alt('center') });
    rows.push({ id: 'bottom', k: 'TV bottom', v: m.bottom, sub, alt: alt('bottom') });
    if (chain.hung != null) {
      let how = '';
      if (chain.mode === 'split') how = 'VESA ' + T(chain.vesaTop) + ' − hook ' + T(chain.hookDrop) + ' − arm ' + T(chain.armDrop) + (chain.sag ? ' − sag ' + T(chain.sag) : '');
      else if (chain.from === 'bottom') how = 'height ' + T(tv.h) + ' − ' + T(chain.toBottom) + ' to bottom' + (chain.sag ? ' − sag ' + T(chain.sag) : '');
      else if (chain.sag) how = 'measured ' + T(chain.measured) + ' − sag ' + T(chain.sag);
      rows.push({ id: 'chain', k: chain.hung < 0 ? 'Top holes above TV top' : 'Top holes to TV top', v: Math.abs(chain.hung), sub: 'once hung', alt: how });
    }
    if (tv.w != null || tv.h != null) {
      rows.push({ id: 'tv', k: 'TV', s: (tv.w != null ? T(tv.w) : '?') + ' × ' + (tv.h != null ? T(tv.h) : '?'), sub: tv.est ? tv.size + '″ class, estimate' : (tv.model || 'measured'), cls: 'wide' });
    }
    if (ref.kind === 'mantle') {
      if (ref.refNow != null && Math.abs(ref.slope) > EPS) rows.push({ id: 'mantle', k: cap(ref.noun), s: 'left ' + T(ref.L) + ' · right ' + T(ref.R), sub: 'measure up from the ' + ref.noun + ' at the center line, ' + T(ref.refNow) + ' above floor', cls: 'wide' });
      if (r.bar) { /* the soundbar row gives its gap over the mantle */ }
      else if (ref.gapL != null && Math.abs(ref.slope) > EPS) rows.push({ id: 'gaps', k: 'Gap over ' + ref.noun, s: 'left ' + T(ref.gapL) + ' · right ' + T(ref.gapR), sub: 'at the TV ends', cls: 'wide' });
      else if (ref.gap != null && ref.edge !== 'bottom') rows.push({ id: 'gap', k: 'Gap over ' + ref.noun, v: ref.gap, sub: 'TV bottom to ' + ref.topName });
    }
    if (ref.kind === 'ceiling' && ref.gap != null && ref.edge !== 'top') rows.push({ id: 'gap', k: 'Gap to ceiling', v: ref.gap, sub: 'TV top to ceiling' });
    if (r.bar) {
      const b = r.bar, title = b.kind === 'tv' ? 'Soundbar on the TV mount' : 'Soundbar on the wall';
      if (b.need.length) {
        const why = { height: 'add the bar height', position: 'place the TV first', floor: 'add the ' + ref.kind + ' height to center it' }[b.need[0]];
        rows.push({ id: 'bar', k: title, s: why, cls: 'wide' });
      } else {
        const altFor = k => b.aff[k] == null ? '' : ffNow ? T(b.aff[k]) + ' above finished floor' : ref.kind !== 'floor' ? T(b.aff[k]) + ' above floor' : '';
        if (b.hole != null) rows.push({ id: 'barhole', k: 'Drill soundbar holes', v: b.m.hole, sub, alt: [altFor('hole'), 'on the center line'].filter(Boolean).join(', ') });
        const how = b.place === 'center' ? 'centered between the TV and the ' + (b.under.what === 'floor' ? 'floor' : b.under.what + ' top') + ', ' + T(b.gap) + ' each side'
          : (b.kind === 'tv' ? 'flush under the TV' : Math.abs(b.gap) < EPS ? 'right under the TV' : T(b.gap) + ' below the TV') + (b.clear != null && b.clear >= -EPS ? ', ' + T(b.clear) + ' over the ' + (b.under.what === 'floor' ? 'floor' : b.under.what) : '');
        rows.push({ id: 'bar', k: title, s: 'top ' + T(b.m.top) + ' · bottom ' + T(b.m.bottom), sub, alt: how, cls: 'wide' + (b.clear != null && b.clear < -EPS ? ' warn' : '') });
      }
    }
    if (r.center) {
      const c = r.center;
      rows.push({ id: 'centerline', k: 'Center line', v: c.pos, sub: c.mode === 'half' ? 'from either end' : 'from the ' + c.from + ' edge', alt: c.mode === 'two' ? 'between ' + T(c.a) + ' and ' + T(c.b) + ', ' + T(c.half) + ' each way' : 'half of ' + T(c.d) });
    }
    if (r.mode === 'pro') {
      if (r.studs.length) rows.push({ id: 'studs', k: 'Studs', s: r.studs.map(s => (s < 0 ? 'L ' : s > 0 ? 'R ' : '') + T(Math.abs(s))).join(' · '), sub: 'from the center line', cls: 'wide' });
      if (r.slide) {
        const s = r.slide;
        const studsOn = 'lags into ' + s.hits.length + ' stud' + (s.hits.length > 1 ? 's' : '');
        const tvOn = Math.abs(s.used) < EPS ? 'TV centered on the plate' : 'TV ' + side(s.used) + ' of plate center';
        const room = s.from === 'mount' ? 'slide ' + T(s.slide) + ' each way' : s.from === 'plate-novesa' ? 'add the VESA width to check both arms stay on the plate' : 'arms can go ' + T(s.slide) + ' either way on the plate';
        if (s.ok) rows.push({ id: 'plate', k: 'Plate', s: 'center ' + side(s.P), sub: studsOn + ', ' + tvOn, alt: Math.abs(s.used) > EPS && s.from !== 'mount' ? 'slide the arms ' + side(s.used) + ' on the plate rails' + (s.from === 'plate-novesa' ? '; ' + room : '') : s.from === 'plate-novesa' ? room : '', cls: 'wide good' });
        else rows.push({ id: 'plate', k: 'Plate', s: s.reason === 'span' ? 'can’t reach ' + s.need + ' studs' : 'needs ' + T(s.short) + ' more slide', sub: s.reason === 'slide' ? room : 'lag slots ' + T(s.lagSpan) + ' end to end', cls: 'wide warn' });
      }
      if (r.adjust) {
        const a = r.adjust, parts = [];
        if (a.up != null) parts.push('up ' + T(a.up));
        if (a.down != null) parts.push('down ' + T(a.down));
        if (a.left != null) parts.push('left ' + T(a.left));
        if (a.right != null) parts.push('right ' + T(a.right));
        if (parts.length) rows.push({ id: 'adjust', k: 'Room left after drilling', s: parts.join(' · '), sub: 'mount adjustment', cls: 'wide' });
      }
      if (r.box) {
        const b = r.box;
        if (b.set) {
          if (b.at) rows.push({ id: 'box', k: 'Recessed box', s: b.shows.length ? 'shows ' + b.shows.map(s => T(s.d) + ' ' + s.k).join(', ') + ' the TV' : b.tvKnown ? 'hidden behind the TV' : 'bottom ' + T(r.toMeasure(b.at.y0)) + ' ' + sub, sub: offLine(b.at.x), cls: b.shows.length ? 'wide warn' : 'wide' });
        } else if (b.at) rows.push({ id: 'box', k: 'Recessed box', s: 'center ' + T(r.toMeasure(b.at.cy)) + ' ' + sub, sub: offLine(b.at.x) + ', ' + (b.at.half ? 'half ' + b.at.half + ' the plate' : 'behind the TV'), alt: 'top ' + T(r.toMeasure(b.at.y1)) + ', bottom ' + T(r.toMeasure(b.at.y0)), cls: 'wide' });
        else if (b.zones.length) {
          const z = b.zones[0];
          rows.push({ id: 'box', k: 'Box zone', s: T(r.toMeasure(z.y0)) + ' to ' + T(r.toMeasure(z.y1)) + ' ' + sub, sub: 'within ' + T(Math.abs(z.x0)) + ' of the center line, behind the TV', cls: 'wide' });
        }
      }
      if (r.view) {
        const v = r.view;
        if (v.need) rows.push({ id: 'view', k: 'Viewing angle', s: v.need === 'floor' ? 'needs the floor height' : 'needs a TV position', sub: v.need === 'floor' ? 'add the ' + (ref.kind === 'mantle' ? 'mantle' : 'ceiling') + ' height' : '', cls: 'wide' });
        else {
          const word = { good: 'comfortable', high: 'high', bad: 'too high', low: 'low' }[v.rating];
          const deg = a => (a < 0 ? '−' : '') + Math.abs(a).toFixed(1).replace(/\.0$/, '') + '°';
          rows.push({
            id: 'view', k: 'Viewing angle', s: deg(v.center) + ' to center, ' + word,
            sub: 'top ' + deg(v.top) + ', bottom ' + deg(v.bottom) + (v.fov ? ', fills ' + Math.round(v.fov) + '° of view' : ''),
            alt: 'center at or below ' + T(v.maxCenter) + ' above floor keeps it under 15°' + (v.tilt > 1 ? ', tilt down about ' + Math.round(v.tilt) + '°' : ''),
            cls: 'wide ' + (v.rating === 'good' ? 'good' : 'warn')
          });
        }
      }
      if (r.built) {
        const b = r.built, word = d => Math.abs(d) < 1 / 64 ? 'on plan' : T(Math.abs(d)) + (d > 0 ? ' high' : ' low');
        const parts = [];
        if (b.dTop != null) parts.push('top ' + word(b.dTop));
        if (b.dBot != null) parts.push('bottom ' + word(b.dBot));
        let note = '';
        if (b.hErr != null && Math.abs(b.hErr) > 1 / 8) note = 'measured TV height is off by ' + T(Math.abs(b.hErr)) + '; recheck';
        else if (Math.abs(b.avg) >= 1 / 64) note = 'a sag of ' + T(b.sag) + ' would have predicted this';
        rows.push({ id: 'built', k: 'As built', s: parts.join(' · '), sub: 'measured vs planned', alt: note, cls: 'wide' + (Math.abs(b.avg) > 1 / 4 ? ' warn' : '') });
      }
    }
    return rows;
  }

  /* ---------- the sketch: shapes and dimensions in wall inches ---------- */
  // Items: rect {x0,y0,x1,y1}, poly {pts}, line {x0,y0,x1,y1, hspan|vspan, text}, dot {x,y},
  // mark {x,y}, label {x,y,lines,anchor}, dim {side, a, b, at, v, name, input: the number you set}. The app lays out
  // dimension tiers, extends spanning lines, and fills {inch} tokens.

  function sketchFor(r) {
    const { y, tv, ref, e } = r;
    if (y.top == null || tv.h == null) return null;
    const W = tv.w || tv.h * 16 / 9, x0 = -W / 2, x1 = W / 2;
    const it = [];
    const add = o => it.push(o);
    // Who sees an item: crew: true is for the installer only (holes, studs, layout marks);
    // client: true is for the client screenshot only. Items with neither show in both.
    const crew = o => add(Object.assign(o, { crew: true }));

    // reference lines and mantle
    if (ref.kind === 'floor') {
      add({ t: 'line', cls: 'floor', x0, x1, y0: -ref.ff, y1: -ref.ff, hspan: true, text: Math.abs(ref.ff) > EPS ? 'Floor now' : 'Floor' });
      if (Math.abs(ref.ff) > EPS) add({ t: 'line', cls: 'ffloor', x0, x1, y0: 0, y1: 0, hspan: true, text: 'Finished floor' });
    } else if (ref.kind === 'ceiling') {
      add({ t: 'line', cls: 'ceiling', x0, x1, y0: 0, y1: 0, hspan: true, text: 'Ceiling' });
    } else {
      const sp = ref.span || W + 8, s = ref.slope || 0;
      const th = 2.5;
      add({ t: 'poly', cls: 'mantle', pts: [[-sp / 2, -s * sp / 2], [sp / 2, s * sp / 2], [sp / 2, s * sp / 2 - th], [-sp / 2, -s * sp / 2 - th]] });
      add({ t: 'label', cls: 'mantle', x: 0, y: -th / 2, top: 0, lines: [cap(r.ref.noun)], anchor: 'middle', inside: true });
    }
    if (ref.kind !== 'floor' && ref.refNow != null) {
      add({ t: 'line', cls: 'floor', x0, x1, y0: -ref.refNow, y1: -ref.refNow, hspan: true, text: 'Floor' });
      if (Math.abs(ref.ff) > EPS) add({ t: 'line', cls: 'ffloor', x0, x1, y0: -ref.refNow + ref.ff, y1: -ref.refNow + ref.ff, hspan: true, text: 'Finished floor' });
    }

    // The room around the TV. Sketch only: these items carry room: true, and only screenshot mode
    // draws them. Heights are measured from the floor as it is today; walls from the center line.
    const room = e.room, fromFloor = h => ref.refNow == null || !isNum(h) ? null : h - ref.refNow;
    const cy = ref.kind !== 'ceiling' ? fromFloor(room.ceil) : null;
    if (cy != null) {
      add({ t: 'line', cls: 'ceiling', x0, x1, y0: cy, y1: cy, hspan: true, text: 'Ceiling', room: true });
      add({ t: 'dim', side: 'right', a: -ref.refNow, b: cy, v: room.ceil, name: 'ceiling', key: 'room', room: true });
      if (y.top != null && cy > y.top + EPS) add({ t: 'dim', side: 'right', a: y.top, b: cy, v: cy - y.top, name: 'to ceiling', key: 'room', room: true });
    }
    const my = ref.kind !== 'mantle' ? fromFloor(room.mantle) : null;
    if (my != null) {
      const sp = W + 8, th = 2.5;
      add({ t: 'poly', cls: 'mantle', pts: [[-sp / 2, my], [sp / 2, my], [sp / 2, my - th], [-sp / 2, my - th]], room: true });
      add({ t: 'label', cls: 'mantle', x: 0, y: my - th / 2, top: my, lines: [cap(r.ref.noun)], anchor: 'middle', inside: true, room: true });
      add({ t: 'dim', side: 'right', a: -ref.refNow, b: my, v: room.mantle, name: ref.short, key: 'room', room: true });
    }
    for (const [d, dir] of [[room.left, -1], [room.right, 1]]) {
      if (!isNum(d) || d <= 0) continue;
      add({ t: 'line', cls: 'wall', x0: dir * d, x1: dir * d, y0: y.bottom, y1: y.top, vspan: true, side: dir, room: true });
      // the gap to the wall, drawn between the wall and the TV side a quarter of the way down the TV, clear of its name
      if (d > W / 2 + EPS) add({ t: 'dim', side: 'inline', a: dir * d, b: dir * W / 2, at: y.top - tv.h / 4, v: d - W / 2, name: 'wall', key: 'wall', room: true });
    }

    // eye line from the viewing check
    if (r.view && r.view.eyeY != null) {
      add({ t: 'line', cls: 'eye', x0, x1, y0: r.view.eyeY, y1: r.view.eyeY, hspan: true, text: 'Seated eye ' + Math.round(r.view.center) + '°' });
    }

    // studs and center-tool marks
    const reach = W / 2 + 18;
    for (const s of r.studs) if (Math.abs(s) <= reach) crew({ t: 'line', cls: 'stud', x0: s, x1: s, y0: y.bottom, y1: y.top, vspan: true, text: (s < 0 ? 'L ' : s > 0 ? 'R ' : '') + T(Math.abs(s)) });
    if (r.center) {
      const c = r.center, dir = c.from === 'left' ? -1 : 1, xe = dir * c.pos;
      const far = Math.abs(xe) > Math.max(W, 48);
      crew({ t: 'line', cls: 'edge', x0: xe, x1: xe, y0: y.bottom, y1: y.top, vspan: true, far, text: (c.from === 'left' ? 'Left' : 'Right') + ' edge' });
      if (c.mode === 'two') {
        for (const [nm, v] of [['A', c.a], ['B', c.b]]) {
          const xm = xe - dir * v;
          crew({ t: 'line', cls: 'markline', x0: xm, x1: xm, y0: y.bottom, y1: y.top, vspan: true, far: Math.abs(xm) > Math.max(W, 48), text: nm });
          crew({ t: 'dim', side: 'bottom', a: xe, b: xm, v: Math.abs(v), name: nm, far: far || Math.abs(xm) > Math.max(W, 48) });
        }
      } else {
        const xo = xe - dir * c.d;
        crew({ t: 'line', cls: 'edge', x0: xo, x1: xo, y0: y.bottom, y1: y.top, vspan: true, far: Math.abs(xo) > Math.max(W, 48), text: (c.from === 'left' ? 'Right' : 'Left') + ' edge' });
        crew({ t: 'dim', side: 'bottom', a: xe, b: xo, v: c.d, name: 'total', far: true });
      }
      crew({ t: 'dim', side: 'bottom', a: xe, b: 0, v: c.pos, name: 'center', far });
    }

    // the TV, the plate, holes
    crew({ t: 'line', cls: 'center', x0: 0, x1: 0, y0: y.bottom - 2, y1: y.top + 2, vspan: true });
    if (r.box) {
      for (const z of r.box.zones) crew({ t: 'rect', cls: 'zone', x0: z.x0, x1: z.x1, y0: z.y0, y1: z.y1 });
    }
    add({ t: 'rect', cls: 'tv', x0, x1, y0: y.bottom, y1: y.top });
    if (r.box && r.box.at) crew({ t: 'rect', cls: 'box', x0: r.box.at.x0, x1: r.box.at.x1, y0: r.box.at.y0, y1: r.box.at.y1, text: 'Box' });
    if (r.plate) crew({ t: 'rect', cls: 'plate', x0: r.plate.x0, x1: r.plate.x1, y0: r.plate.y0, y1: r.plate.y1 });
    for (const hy of r.holeRows) crew({ t: 'line', cls: 'drill', x0: x0 - 1.5, x1: x1 + 1.5, y0: hy, y1: hy });
    const sb = r.bar && r.bar.top != null && r.bar.w ? r.bar : null;
    if (sb) {
      add({ t: 'rect', cls: 'sbar', x0: -sb.w / 2, x1: sb.w / 2, y0: sb.bottom, y1: sb.top, text: 'Soundbar' });
      if (sb.hole != null) crew({ t: 'line', cls: 'drill', x0: -sb.w / 2 - 1.5, x1: sb.w / 2 + 1.5, y0: sb.hole, y1: sb.hole });
    }
    for (const d of r.drill) crew({ t: 'dot', cls: d.ok ? 'hole' : 'hole miss', x: d.x, y: d.y });
    crew({ t: 'mark', cls: 'cmark', x: 0, y: y.center });

    const name = tv.est ? tv.size + '″ class (estimate)' : (tv.model || 'TV');
    const label = { t: 'label', cls: 'tvname', x: 0, y: y.center, lines: [name], anchor: 'middle', inside: true, avoid: y.hole };
    if (!tv.est) add(label);
    else { add(Object.assign({}, label, { lines: [tv.size + '″ TV'], client: true })); crew(label); }

    if (r.built && r.built.top != null) {
      const bt = r.built.top, bb = r.built.bottom != null ? r.built.bottom : bt - tv.h;
      crew({ t: 'rect', cls: 'built', x0, x1, y0: bb, y1: bt });
    }

    // dimensions: from the line you measure from on the left, TV-local on the right
    const from = ref.kind === 'floor' ? -ref.ff : 0;
    const keys = [['bottom', 'bottom'], ['center', 'center'], ['hole', 'holes'], ['top', 'top']];
    // the client reads heights above the finished floor; the installer reads the tape from the floor as it is now
    const ffNow = Math.abs(from) > EPS;
    for (const [k, nm] of keys) {
      if (y[k] == null) continue;
      const d = { t: 'dim', side: 'left', b: y[k], name: nm, key: k, input: k === ref.edge };
      if (Math.abs(y[k] - from) > EPS) (k === 'hole' || ffNow ? crew : add)(Object.assign({ a: from, v: Math.abs(y[k] - from) }, d));
      if (k !== 'hole' && ffNow && Math.abs(y[k]) > EPS) add(Object.assign({ a: 0, v: Math.abs(y[k]), client: true }, d));
    }
    if (r.holeRows.length > 1) {
      const low = r.holeRows[1];
      crew({ t: 'dim', side: 'left', a: from, b: low, v: Math.abs(low - from), name: 'lower holes', key: 'hole2' });
    }
    if (r.chain.from === 'bottom' && y.hole != null) crew({ t: 'dim', side: 'right', a: y.bottom, b: y.hole, v: Math.abs(y.hole - y.bottom), name: 'holes to bottom', key: 'chain' });
    else if (r.chain.hung != null && Math.abs(r.chain.hung) > EPS) crew({ t: 'dim', side: 'right', a: y.hole, b: y.top, v: Math.abs(r.chain.hung), name: 'holes to top', key: 'chain' });
    if (r.bar && r.bar.top != null) {
      const b = r.bar;
      if (b.kind === 'wall') crew({ t: 'dim', side: 'left', a: from, b: b.hole != null ? b.hole : b.top, v: Math.abs((b.hole != null ? b.hole : b.top) - from), name: b.hole != null ? 'bar holes' : 'bar top', key: b.hole != null ? 'barhole' : 'bartop' });
      if (b.gap > EPS) add({ t: 'dim', side: 'right', a: b.top, b: y.bottom, v: b.gap, name: 'gap', key: 'bargap' });
      if (ref.edge === 'bar') {
        const d = { t: 'dim', side: 'left', b: b.bottom, name: 'bar bottom', key: 'barbottom', input: true };
        if (Math.abs(b.bottom - from) > EPS) (ffNow ? crew : add)(Object.assign({ a: from, v: Math.abs(b.bottom - from) }, d));
        if (ffNow && Math.abs(b.bottom) > EPS) add(Object.assign({ a: 0, v: Math.abs(b.bottom), client: true }, d));
      }
    }
    add({ t: 'dim', side: 'right', a: y.bottom, b: y.top, v: tv.h, name: 'height', key: 'tv' });
    if (ref.kind !== 'floor' && ref.refNow != null) add({ t: 'dim', side: 'right', a: -ref.refNow, b: 0, v: ref.refNow, name: ref.kind === 'mantle' ? ref.short : 'ceiling', ref: true });
    if (ref.kind === 'floor' && Math.abs(ref.ff) > EPS) crew({ t: 'dim', side: 'right', a: -ref.ff, b: 0, v: Math.abs(ref.ff), name: 'finish' });
    if (tv.w) add({ t: 'dim', side: 'top', a: x0, b: x1, v: tv.w, name: 'width', key: 'tv' });
    if (ref.kind === 'mantle' && ref.gapL != null && Math.abs(ref.slope) > EPS && !r.bar) {
      crew({ t: 'label', cls: 'gap', x: x0 + 1, y: y.bottom, lines: ['gap ' + T(ref.gapL)], anchor: 'start', below: true });
      crew({ t: 'label', cls: 'gap', x: x1 - 1, y: y.bottom, lines: ['gap ' + T(ref.gapR)], anchor: 'end', below: true });
    }

    return { items: it, tv: { x0, x1, y0: y.bottom, y1: y.top } };
  }

  return {
    isNum, parseInches, formatInches, formatExact, fill, T,
    SIZES, BEZEL, sizeEstimate, EDGE, KINDS, DEFAULTS, REF_LABEL, EDGE_NAME, FIELD_NAME,
    newTab, edgeOf, effective, centerTool, fillStuds, slideCheck, placeInBay, compute
  };
});
