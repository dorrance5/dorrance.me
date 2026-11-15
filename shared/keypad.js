/* The on-screen number keypad of TV Mount, Converter and Triangle (with shared/keypad.css; the other apps do not load
   it). Like Calculator: whole numbers on the left, numerator over denominator on the right, and a bar under them with
   slot 1 (± or the feet key, labelled ft), Clear, previous and next field, and Done. It replaces the phone keyboard: the app's
   fields are read-only and open it. Built on the first open; one click listener on the keypad and one keydown
   listener on the page, for a hardware keyboard.

   Keypad.open(o) shows it for one field (calling it again moves it to another field):
     value   the field's value: a number (inches, or a decimal when frac is off) or a string like 3 1/2 or 5' 3 1/4"
     frac    the fraction keys work (off: dimmed and disabled)
     slot    'sign' (±) or 'feet' (′), slotOff dims it
     nav     the previous and next arrows work
     unit    shown after the value, like '"' or ' mm'
     input() a key changed the value: read Keypad.value() or Keypad.text()
     done()  Done or Escape; step(dir) an arrow, Tab or Return (dir 1 or -1)
   The app shows the field's name and a live result line with Keypad.sync(name, live), and hides it with close(). */
window.Keypad = (function () {
  'use strict';
  const { esc, buzz } = App;
  const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const BACK = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.6 5.5h9.9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9.6a2 2 0 0 1-1.5-.7l-5.1-5.8 5.1-5.8a2 2 0 0 1 1.5-.7z"/><path d="m12 9.5 5 5m0-5-5 5"/></svg>';
  const arrow = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  const subs = (p, name) => DIGITS.map(d => `<button data-key="${p}${d}" aria-label="${name} ${d}">${d}</button>`).join('');
  const HTML = `<div class="kp-in">
    <div class="kp-top" aria-live="polite"><div class="kp-name" id="kpName"></div><div class="kp-val" id="kpVal"></div></div>
    <div class="kp-keys">
      <div class="kp-whole" role="group" aria-label="Whole numbers">
        ${['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(d => `<button data-key="${d}">${d}</button>`).join('')}
        <button data-key="." class="sym" aria-label="Decimal point">.</button><button data-key="0">0</button>
        <button data-key="back" class="sym" aria-label="Delete">${BACK}</button>
      </div>
      <div class="kp-frac">
        <div class="kp-sub nu" id="kpNu" role="group" aria-label="Numerator">${subs('n', 'Numerator')}</div>
        <div class="kp-div"></div>
        <div class="kp-sub de" id="kpDe" role="group" aria-label="Denominator">${subs('d', 'Denominator')}</div>
      </div>
    </div>
    <div class="kp-bar">
      <button data-key="sign" data-slot aria-label="Plus or minus">±</button>
      <button data-key="clear" class="clr">Clear</button>
      <button data-key="prev" class="nav" aria-label="Previous field">${arrow('m6 15 6-6 6 6')}</button>
      <button data-key="next" class="nav" aria-label="Next field">${arrow('m6 9 6 6 6-6')}</button>
      <button data-key="done" class="done">Done</button>
    </div>
  </div>`;

  let el = null, o = null, name = '', live = '';
  // What is typed: feet, whole, numerator, denominator, as strings. at is where keyboard digits go (w, n or d).
  // fresh: no key yet since the field opened, so the first one replaces the value.
  const s = { ft: '', w: '', n: '', d: '', neg: false, fresh: true, at: 'w' };
  const blank = () => !s.ft && !s.w && !s.n && !s.d;
  const reset = () => { s.ft = ''; s.w = ''; s.n = ''; s.d = ''; s.neg = false; s.at = 'w'; };

  function build() {
    el = document.createElement('div');
    el.className = 'kp'; el.id = 'kp'; el.hidden = true;
    el.innerHTML = HTML;
    document.body.appendChild(el);
    el.addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b && !b.disabled) { buzz(4); key(b.dataset.key); } });
    document.addEventListener('keydown', e => {
      if (!o || e.metaKey || e.ctrlKey || document.querySelector('.backdrop')) return;
      const m = { Backspace: 'back', Enter: o.nav ? 'next' : 'done', Escape: 'done', Delete: 'clear', '-': 'sign', '.': '.', ' ': 'space', '/': 'over', "'": 'feet' };
      let k = /^\d$/.test(e.key) ? (s.at === 'w' ? '' : s.at) + e.key : m[e.key];
      if (e.key === 'Tab' && o.nav) k = e.shiftKey ? 'prev' : 'next';
      if (k) { e.preventDefault(); key(k); }
    });
  }

  // A number: in 64ths when it is one (57.125 is 57 1/8), else a decimal. A string: the forms the apps' parsers read.
  function load(v) {
    reset();
    if (typeof v === 'number') {
      if (!isFinite(v)) return;
      s.neg = v < 0;
      if (!o.frac) { s.w = String(+Math.abs(v).toFixed(2)); return; }
      const a = Math.abs(v), n64 = Math.round(a * 64);
      if (Math.abs(a * 64 - n64) < 1e-7) {
        const w = Math.floor(n64 / 64);
        let num = n64 % 64, den = 64;
        while (num && num % 2 === 0) { num /= 2; den /= 2; }
        s.w = w || !num ? String(w) : '';
        if (num) { s.n = String(num); s.d = String(den); }
      } else s.w = String(+a.toFixed(4));
      return;
    }
    let t = String(v == null ? '' : v).trim().replace(/[”″]/g, '"').replace(/[’′]/g, "'").replace(/^[-−]\s*/, () => { s.neg = true; return ''; });
    let m = t.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft)\s*(.*)$/i);
    if (m) { s.ft = m[1]; t = m[2]; }
    t = t.replace(/\s*(?:"|in)$/i, '').trim();
    if ((m = t.match(/^(?:(\d*\.?\d*)\s+)?(\d+)\s*\/\s*(\d+)$/))) { s.w = m[1] || ''; s.n = m[2]; s.d = m[3]; }
    else if (/^\d*\.?\d*$/.test(t)) s.w = t;
    else if (isFinite(parseFloat(t.replace(/,/g, '')))) s.w = String(parseFloat(t.replace(/,/g, '')));   // 1,234.5
    else s.neg = false;
  }

  // null when blank, NaN while half typed. A fraction like 1/1 is half typed until the field is left, since 1/16
  // starts out that way. Feet count 12 inches.
  function value(leaving) {
    if (blank()) return null;
    let f = 0;
    if (s.n || s.d) {
      const n = +s.n, d = +s.d;
      if (!s.n || !d || (!leaving && n >= d)) return NaN;
      f = n / d;
    }
    return (s.neg ? -1 : 1) * ((s.ft ? parseFloat(s.ft) * 12 : 0) + (s.w ? parseFloat(s.w) : 0) + f);
  }
  // The same as text the apps' parsers read: "3 1/2", "-40", "5' 3 1/4\"", "5'". '' when blank, null while half typed.
  function text(leaving) {
    const v = value(leaving);
    if (v === null) return '';
    if (Number.isNaN(v)) return null;
    const w = s.w.replace(/\.$/, '');
    const inch = (s.n ? (w ? w + ' ' : '') + s.n + '/' + s.d : w);
    return (s.neg ? '-' : '') + (s.ft ? s.ft + "'" + (inch ? ' ' + inch + '"' : '') : inch);
  }

  function key(k) {
    if (k === 'done') { o.done(); return; }
    if (k === 'next' || k === 'prev') { if (o.nav) o.step(k === 'next' ? 1 : -1); return; }
    if (!o.frac && (/^[nd]\d$/.test(k) || k === 'space' || k === 'over')) return;
    if ((k === 'sign' || k === 'feet') && (o.slot !== k || o.slotOff)) return;
    if (k === 'space') { if (s.w) s.at = 'n'; return; }       // keyboard: "57 1/8"
    if (k === 'over') {                                          // keyboard: "3/4" moves the 3 up
      if (s.at === 'w' && !s.n && s.w && !s.w.includes('.') && !s.fresh) { s.n = s.w; s.w = ''; }
      s.at = 'd'; paint(); return;
    }
    const fresh = s.fresh;
    s.fresh = false;
    if (/^[nd]?\d$/.test(k) || k === '.') {
      const at = k.length === 2 ? k[0] : 'w';
      // The first key on a filled field replaces it. A whole-number key starts over,
      // a numerator key keeps the whole number, a denominator key keeps the numerator too.
      if (fresh) {
        if (at === 'w') { s.w = ''; s.ft = ''; s.neg = false; }
        if (at !== 'd') s.n = '';
        s.d = '';
      }
      s.at = at;
      if (k === '.') { if (!s.w.includes('.')) s.w = (s.w || '0') + '.'; }
      else if (s[at].replace('.', '').length < (at === 'w' ? 6 : 3)) s[at] = (s[at] === '0' ? '' : s[at]) + k.slice(-1);
    } else if (k === 'back') {
      // back through the fraction, the inches, then the feet mark (the feet become the whole number again)
      const at = ['d', 'n', 'w'].find(p => s[p]);
      if (at) { s[at] = s[at].slice(0, -1); s.at = at; }
      else if (s.ft) { s.w = s.ft; s.ft = ''; s.at = 'w'; }
    } else if (k === 'feet') {
      // the whole number typed so far is feet; what comes next is inches
      const w = s.w.replace(/\.$/, '');
      if (!w || s.ft || s.n || s.d) { paint(); return; }
      s.ft = w; s.w = ''; s.at = 'w';
    } else if (k === 'sign') s.neg = !s.neg;
    else if (k === 'clear') reset();
    o.input();
  }

  function paint() {
    if (!o) return;
    let h = blank() ? (s.neg ? '−' : '—') : (s.neg ? '−' : '') + (s.ft ? esc(s.ft) + "'" + (s.w || s.n || s.d ? ' ' : '') : '') + esc(s.w);
    if (s.n || s.d) h += `<span class="fr"><span class="nu${s.n ? ' lit' : ''}">${s.n || '·'}</span><span class="de${s.d ? ' lit' : ''}">${s.d || '·'}</span></span>`;
    const val = el.querySelector('.kp-val');
    val.innerHTML = h + (blank() ? '' : s.ft ? (s.w || s.n || s.d ? '"' : '') : o.unit || '');
    val.classList.toggle('ph', blank());
    el.querySelector('.kp-name').innerHTML = esc(name) + (live ? `<span class="live">${esc(live)}</span>` : '');
  }

  // Which keys apply: the rest stay in place, dimmed and disabled, so nothing moves.
  function mode() {
    el.classList.toggle('nofrac', !o.frac);
    el.querySelectorAll('.kp-sub button').forEach(b => { b.disabled = !o.frac; });
    const slot = el.querySelector('[data-slot]'), feet = o.slot === 'feet';
    if (slot.dataset.key !== o.slot) {
      slot.dataset.key = feet ? 'feet' : 'sign';
      slot.textContent = feet ? 'ft' : '±';
      slot.setAttribute('aria-label', feet ? 'Feet' : 'Plus or minus');
      slot.classList.toggle('ft', feet);
    }
    slot.disabled = !!o.slotOff;
    el.querySelectorAll('.kp-bar .nav').forEach(b => { b.disabled = !o.nav; });
  }

  function open(opts) {
    if (!el) build();
    o = Object.assign({ frac: true, slot: 'sign', slotOff: false, nav: true, unit: '' }, opts);
    mode();
    load(o.value);
    s.fresh = true;
    el.hidden = false;
    document.documentElement.classList.add('nokb');   // the keypad is the input method: no html.kb (base.js)
  }
  function close() {
    if (!o) return;
    o = null;
    el.hidden = true;
    document.documentElement.classList.remove('nokb');
  }
  function sync(n, l) { name = n; live = l || ''; paint(); }
  // Scroll a field to sit 12 px above the keypad, or under the top of its scroller. With box (the field's card), the
  // card's bottom clears the keypad by 12 px too, as far as the field can still be seen.
  function reveal(field, scroller, box) {
    if (!field || !el) return;
    const rc = field.getBoundingClientRect(), mr = scroller.getBoundingClientRect();
    const bottom = innerHeight - el.offsetHeight - 12;
    const need = Math.max(rc.bottom - bottom, box ? Math.min(box.getBoundingClientRect().bottom - bottom, rc.top - mr.top - 8) : 0);
    if (need > 0) scroller.scrollBy({ top: need, behavior: 'smooth' });
    else if (rc.top < mr.top + 8) scroller.scrollBy({ top: rc.top - mr.top - 8, behavior: 'smooth' });
  }

  return {
    open, close, sync, reveal, value, text,
    get isOpen() { return !!o; },
    get touched() { return !!o && !s.fresh; },
    get height() { return el ? el.offsetHeight : 0; }
  };
})();
