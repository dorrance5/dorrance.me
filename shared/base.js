/* Shared helpers for the small apps on dorrance.me. Plain script, no build step. */
window.App = (function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  function load(key, def) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; } catch (e) { return def; }
  }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  /* ---- theme: one setting shared by every app, key "theme" = auto | light | dark | aurora ---- */
  /* Aurora is secret: the picker shows Auto, Day and Night. Five taps on the "Theme" label within
     2 seconds turn Aurora on, and an Aurora button shows, selected, until another theme is picked.
     An app can leave Aurora out (App.init({ aurora: false })); it then shows Night for that setting. */
  const darkMQ = matchMedia('(prefers-color-scheme: dark)');
  let aurora = true;
  function themePref() { try { return localStorage.getItem('theme') || 'auto'; } catch (e) { return 'auto'; } }
  const shown = t => t === 'aurora' && !aurora ? 'dark' : t;
  function applyTheme() {
    const t = shown(themePref());
    const mode = t === 'auto' ? (darkMQ.matches ? 'dark' : 'light') : t;
    const r = document.documentElement;
    if (mode === 'light') delete r.dataset.mode; else r.dataset.mode = mode;
    const m = $('meta[name="theme-color"]');
    if (m) m.content = getComputedStyle(document.body).backgroundColor;
    document.querySelectorAll('[data-theme]').forEach(b => {
      b.classList.toggle('on', b.dataset.theme === t);
      if (b.dataset.theme === 'aurora') b.hidden = t !== 'aurora';
    });
  }
  function setTheme(t) { try { localStorage.setItem('theme', t); } catch (e) {} applyTheme(); }
  darkMQ.addEventListener('change', applyTheme);
  window.addEventListener('storage', e => { if (e.key === 'theme') applyTheme(); });

  const THEMES = [['auto','Auto'],['light','Day'],['dark','Night']];
  function themeSegHTML() {
    const t = shown(themePref());
    return `<div class="label" data-theme-label>Theme</div><div class="seg">${THEMES.map(([k, l]) =>
      `<button data-theme="${k}" class="${t === k ? 'on' : ''}">${l}</button>`).join('')}${aurora
      ? `<button data-theme="aurora"${t === 'aurora' ? ' class="on"' : ' hidden'}>Aurora</button>` : ''}</div>`;
  }
  // The way back to the list of apps, at the bottom of each app's menu, as in Calculator.
  const homeLinkHTML = () => '<div class="homelink"><a href="../">&lsaquo; dorrance.me</a></div>';
  let taps = [];
  function secretTap() {
    const now = Date.now();
    taps = taps.filter(x => now - x < 2000).concat(now);
    if (taps.length < 5) return;
    taps = [];
    setTheme('aurora');
    toast('Aurora');
  }

  /* ---- sheets ---- */
  function sheet(html, cls = '') {
    closeSheet();
    const b = document.createElement('div');
    b.className = 'backdrop ' + cls;
    b.innerHTML = `<div class="sheet">${html}</div>`;
    b.addEventListener('click', e => {
      if (e.target === b) { closeSheet(); return; }
      const t = e.target.closest('[data-theme]');
      if (t) setTheme(t.dataset.theme);
      if (aurora && e.target.closest('[data-theme-label]')) secretTap();
    });
    document.body.appendChild(b);
    return b.firstElementChild;
  }
  function closeSheet() { document.querySelector('.backdrop')?.remove(); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

  /* ---- toast ---- */
  let toastEl, toastT;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('on'); toastEl.classList.remove('tap'); toastEl.onclick = null;
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 1900);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove(); return ok;
  }

  /* aurora backdrop markup, inserted once */
  function backdrop() {
    if (document.querySelector('.field')) return;
    document.body.insertAdjacentHTML('afterbegin',
      '<div class="field"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="blob b4"></div></div><div class="veil"></div>');
  }

  // A new version takes over in the background while the page still shows the old files, so offer a reload.
  // Only when this app's own worker was in charge already: its first install is not an update.
  function sw() {
    if (!('serviceWorker' in navigator)) return;
    if (navigator.serviceWorker.controller?.scriptURL === new URL('sw.js', location).href)
      navigator.serviceWorker.addEventListener('controllerchange', updated, { once: true });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  function updated() {
    toast('Updated · Tap to reload');
    clearTimeout(toastT);
    toastEl.classList.add('tap'); toastEl.onclick = () => location.reload();
  }

  function init(o) { if (o && o.aurora === false) aurora = false; if (aurora) backdrop(); applyTheme(); sw(); }

  return { $, esc, uid, buzz, load, save, applyTheme, setTheme, themeSegHTML, homeLinkHTML, sheet, closeSheet, toast, copy, init };
})();
