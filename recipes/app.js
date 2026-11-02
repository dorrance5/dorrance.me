/* Recipes — the page: the recipe box, one recipe, cooking mode, the editor and Settings, and for everyone signed in
   the meal plan and the grocery list.
   The data file and the saves are in data.js (window.RecipeData). The meal plan's data and ops are in meals.js
   (window.Meals), which the API Worker uses too. The dorrance.me sign-in is shared/account.js (window.Account): one
   sign-in for every page on the site. */
(function () {
  'use strict';
  const D = window.RecipeData, A = window.Account, M = window.Meals;
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const CACHE = 'recipes-cache', WAITING = 'recipes-waiting', MEALS = 'recipes-meals';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const session = () => A.session();   // { token, name, admin }, or null
  const worker = () => D.api(session() && session().token);
  store.del('recipes-token');   // a GitHub token from before accounts: the Worker holds the token now
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const svg = (d, w = 2.2, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    out: svg('<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>', 2.2, 18),
    pot: svg('<path d="M4 11h16v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M2 11h2M20 11h2"/><path d="M9 7c0-1.5 1-1.5 1-3M14 7c0-1.5 1-1.5 1-3"/>', 2.2, 24),
    next: svg('<path d="M9 5l7 7-7 7"/>', 2.6),
    tick: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.6),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 2.6, 16),
    plan: svg('<path d="M12 5v14M5 12h14"/>', 2.6, 18),
    x: svg('<path d="M7 7l10 10M17 7L7 17"/>', 2.6, 18),
    off: svg('<path d="M7 7l10 10M17 7L7 17"/>', 2.8, 16),
    bag: svg('<path d="M3.5 9.5h17l-1.6 9.1a2 2 0 0 1-2 1.65H7.1a2 2 0 0 1-2-1.65z"/><path d="M8 9.5l3-5.5M16 9.5l-3-5.5"/>', 2, 22)
  };

  /* ---- colors: each category has one; a recipe takes the color of its first category ---- */
  const BUTTER = ['#F6C945', '#2A1D17'];
  // Warm shades of red, orange and yellow, with Salads in plum. Each text color is at 4.5:1 or more on its color.
  const FIXED = {
    soup: ['#C63A24', '#FFF6E6'], grill: ['#8E2817', '#FFF6E6'], 'crock pot': ['#E07B2E', '#2A1D17'], bowls: ['#F28C6B', '#2A1D17'],
    'one pan': ['#A94A1A', '#FFF6E6'], 'sandwiches & tacos': ['#F2A93B', '#2A1D17'], breakfast: ['#F6C945', '#2A1D17'], salads: ['#7A3B69', '#FFF6E6']
  };
  // Any other category: coral, wine, gold or rust, picked by a hash of its name
  const MORE = [['#E5684A', '#2A1D17'], ['#9E2B3A', '#FFF6E6'], ['#D99A1E', '#2A1D17'], ['#A94A1A', '#FFF6E6']];
  const hash = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };
  function colorOf(tag) {
    if (!tag) return BUTTER;
    const k = tag.toLowerCase();
    return FIXED[k] || MORE[hash(k) % MORE.length];
  }
  const ALL = ['var(--solid)', 'var(--on-solid)'];   // the All divider: ink by day, cream at night
  const paint = ([c, f]) => `--c:${c};--cf:${f}`;
  const FACES = [['#C63A24', '#FFF6E6'], BUTTER, ['#E07B2E', '#2A1D17'], ['#2A1D17', '#FFF6E6'], ['#FCE7A6', '#2A1D17'], ['#4F7A3A', '#FFF6E6'], ['#3B5B8C', '#FFF6E6'], ['#7A3B69', '#FFF6E6'], ['#2F6B66', '#FFF6E6'], ['#8A4B2A', '#FFF6E6']];
  const face = name => FACES[hash(String(name).toLowerCase()) % FACES.length];

  /* ---- theme: the site setting, key "theme" = auto | light | dark | aurora ---- */
  // This page has Auto, Day and Night. Aurora, which the apps have, shows as Night here and stays saved.
  const meta = document.querySelector('meta[name="theme-color"]');
  const shownTheme = () => { const t = store.get('theme'); return ['light', 'dark', 'aurora'].includes(t) ? t : 'auto'; };
  function applyTheme() {
    const t = shownTheme();
    if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
    const on = t === 'aurora' ? 'dark' : t;
    document.querySelectorAll('#themeSeg [data-t]').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === on));
    barColor();
  }
  $('themeSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (b) { store.set('theme', b.dataset.t); applyTheme(); }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  addEventListener('storage', e => { if (e.key === 'theme') applyTheme(); });
  // The browser bar takes the color at the top of the screen: the tomato header, or the header of the screen that is
  // open. A sheet over a screen (the ingredients, the dinner picker) keeps the color of the screen under it.
  function barColor() {
    const under = stack.filter(l => !l.classList.contains('over')), l = under[under.length - 1];
    const el = !l ? document.querySelector('.hero') : l.querySelector(':scope > header') || l;
    meta.content = getComputedStyle(el).backgroundColor;
  }

  /* ---- data ---- */
  let data = null, recipes = [], loaded = false;
  let shelf = { book: [], others: [] };   // the person's book, and the recipes shared with them (data.js shelves())
  // Who is looking, for the books: { key, name, partner }, or null signed out. The partner is the household: the person
  // who shares the meal plan.
  function viewer() {
    const s = session();
    if (!s) return null;
    const v = shown();
    return { key: s.name.toLowerCase(), name: s.name, partner: v && v.share && v.share.with ? v.share.with.key : null };
  }
  function setData(d, fromCache) {
    data = d;
    recipes = D.forView(d);
    loaded = true;
    if (!fromCache) store.set(CACHE, JSON.stringify(d));
    renderBox();
    if (viewId && isOpen(view) && !renderView(viewId) && top() === view) back(true);   // deleted on another phone
    if (isOpen(cook)) renderCook();
    drawMeals();   // the names and colors of the planned dinners
  }
  function note(msg) { $('notice').hidden = !msg; $('notice').textContent = msg; }

  // The saved copy shows at once. Signed in, the file comes from GitHub through the Worker, so a change shows
  // before the site updates.
  async function load() {
    try { setData(D.parse(store.get(CACHE)), true); } catch (e) { none.textContent = 'Loading…'; none.hidden = false; }
    if (session()) {
      try { setData((await worker().read()).data); note(''); return; }
      catch (e) {
        if (e.code === 'network') return offline();
        if (e.code === 'signin') signOut();
        note(`${e.message} Showing the copy on the site.`);
      }
    }
    let res;
    try { res = await fetch('recipes.json', { cache: 'no-cache' }); } catch (e) { return offline(); }
    try {
      if (!res.ok) throw new Error(res.status);
      setData(D.parse(await res.text()));
    } catch (e) {
      note(data ? 'The recipes could not be loaded. Showing the copy saved on this phone.' : 'The recipes could not be loaded.');
      if (!data) none.hidden = true;
    }
  }
  function offline() {
    note(data ? 'No connection. Showing the copy saved on this phone.' : 'No connection, and this phone has no saved copy yet.');
    if (!data) none.hidden = true;
  }

  /* ---- the recipe box: divider tabs, one for each category, and a deck of cards; then "Shared with you" ---- */
  const deck = $('deck'), q = $('q'), none = $('none');
  let tab = '';   // the divider that is open: '' for All, or a category
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  // The categories in the book, A to Z, with how many recipes each has. "soup" and "Soup" are one category.
  function categories() {
    const m = new Map();
    for (const r of shelf.book) for (const t of r.tags) {
      const k = t.toLowerCase();
      if (!m.has(k)) m.set(k, { name: t, n: 0 });
      m.get(k).n++;
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }
  const inTab = r => !tab || r.tags.some(t => same(t, tab));
  // Under the name, a search shows why the recipe matched: the ingredients, a category, or a piece of a step or note.
  function why(r, m, t) {
    if (!m) return '';
    if (m.ingredients.length) return m.ingredients.map(i => D.hl(i, t)).join(', ');
    if (m.snippet) return D.hl(m.snippet, t);
    if (D.hl(r.name, t).includes('<mark>')) return '';
    return r.tags.map(x => D.hl(x, t)).filter(x => x.includes('<mark>')).join(' · ');
  }
  function renderBox() {
    shelf = D.shelves(data || { recipes: [] }, recipes, viewer());
    const cats = categories();
    if (tab && !cats.some(c => same(c.name, tab))) tab = '';
    const tabs = [{ name: '', label: 'All', n: shelf.book.length }, ...cats.map(c => ({ ...c, label: c.name }))];
    $('tabs').innerHTML = tabs.map(c => `<button type="button" data-tab="${D.esc(c.name)}" aria-pressed="${same(c.name, tab)}" style="${paint(c.name ? colorOf(c.name) : ALL)}"><span>${D.esc(c.label)}</span><span class="n">${c.n}</span></button>`).join('');
    $('band').style.cssText = paint(tab ? colorOf(tab) : ALL);
    const t = q.value.trim(), cards = [];
    for (const r of shelf.book) {
      if (!inTab(r)) continue;
      const m = t ? D.match(r, t) : null;
      if (t && !m) continue;
      const w = why(r, m, t), first = r.tags[0];
      cards.push(`<li><button class="rc" type="button" data-id="${D.esc(r.id)}" style="${paint(colorOf(first))}"><span class="rc-top"><span class="nm serif">${D.hl(r.name, t)}</span>${first ? `<span class="tg">${D.esc(first)}</span>` : ''}</span>${w ? `<span class="hit">${w}</span>` : ''}</button></li>`);
    }
    deck.innerHTML = cards.join('');
    markOpen();
    const where = tab ? ` under ${tab}` : '';
    none.hidden = cards.length > 0 || !loaded;
    none.textContent = t ? `No recipe${where} has “${t}”.` : shelf.book.length ? `No recipes${where} yet.` : session() ? 'No recipes in your book yet. Tap + to add one.' : 'No recipes yet.';
    $('qClear').hidden = !q.value;
    // Shared with you: everyone else's shared recipes. The search finds them too.
    const more = shelf.others.filter(r => !t || D.match(r, t));
    $('others').hidden = !more.length;
    $('otherList').innerHTML = more.map(r => `<li style="${paint(colorOf(r.tags[0]))}"><button class="sw-open" type="button" data-id="${D.esc(r.id)}"><i></i><span class="nm serif">${D.hl(r.name, t)}</span><small>${r.owner ? `${D.esc(r.owner)}’s recipe` : 'The family’s recipe'}</small></button>`
      + `<button class="pill" type="button" data-pull="${D.esc(r.id)}" aria-label="Add ${D.esc(r.name)} to my book"${busyBook ? ' disabled' : ''}>Add</button></li>`).join('');
  }
  $('otherList').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pull) bookChange({ type: 'pull', id: b.dataset.pull }, b);
    else if (b.dataset.id) openView(b.dataset.id, b);
  });
  q.addEventListener('input', renderBox);
  q.addEventListener('keydown', e => {
    if (e.key === 'Enter') q.blur();
    if (e.key === 'Escape' && q.value) { q.value = ''; renderBox(); }
  });
  $('qClear').addEventListener('click', () => { q.value = ''; renderBox(); q.focus(); });
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    renderBox();
    $('tabs').querySelector(`[data-tab="${CSS.escape(tab)}"]`).focus({ preventScroll: true });
    // a shorter list: keep the dividers at the top of the screen, not past the end of the list
    const hero = document.querySelector('.hero').offsetHeight;
    if (scrollY > hero) scrollTo(0, hero);
  });
  deck.addEventListener('click', e => { const b = e.target.closest('.rc'); if (b) openView(b.dataset.id, b); });
  $('addBtn').addEventListener('click', () => openEditor(null));
  $('signInBtn').addEventListener('click', () => openSettings(false));

  /* ---- full screens over the box ---- */
  // Each open screen is one history entry, so the phone's back button closes the top one.
  const page = $('page'), nav = $('nav');
  const view = $('view'), cook = $('cook'), cookIng = $('cookIng'), editor = $('editor'), settings = $('settings'), importer = $('importer');
  const plan = $('plan'), grocery = $('grocery'), pick = $('pick');
  const layers = [view, cook, cookIng, editor, importer, settings, plan, grocery, pick];
  const tabLayers = [plan, grocery, settings], mealLayers = [plan, grocery, pick];
  const stack = [];
  // Sideways on a wide screen (the open iPhone Duo), an open recipe sits beside the box instead of over it, and the
  // box stays in use: a tap on another card shows that one.
  const wide = matchMedia('(orientation: landscape) and (min-width: 800px)');
  const side = () => wide.matches && stack.length === 1 && top() === view;
  function markOpen() {
    const on = side();
    deck.querySelectorAll('.rc').forEach(b => { if (on && b.dataset.id === viewId) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  }
  let quiet = false;   // the next popstate closes without asking: Cancel, Save and Delete already decided
  const top = () => stack[stack.length - 1];
  const isOpen = l => stack.includes(l);
  function setInert() {
    const beside = side();
    page.inert = stack.length > 0 && !beside;
    layers.forEach(l => { l.inert = l !== top(); });
    root.classList.toggle('locked', stack.length > 0 && !beside);
    root.classList.toggle('side', beside);
    markOpen();
    $('vBackText').textContent = stack[stack.indexOf(view) - 1] === plan ? 'Meal plan' : 'Recipe box';
    drawNav();
    barColor();
  }
  function show(l, opener) {
    l.opener = opener;
    l.hidden = false;
    l.style.zIndex = 20 + stack.length;
    l.scrollTop = 0;
    setInert();
    void l.offsetWidth;   // start the slide from off the screen
    l.classList.add('open');
    l.focus({ preventScroll: true });
  }
  function hide(l, refocus = true) {
    l.classList.remove('open');
    setInert();
    const o = refocus && l.opener;
    if (o && o.matches && o.matches('button, a, input') && document.contains(o) && !o.closest('[inert]')) o.focus({ preventScroll: true });
    const done = () => { if (!l.classList.contains('open')) l.hidden = true; };
    if (reduceMotion.matches) done(); else setTimeout(done, 340);
    if (l === cook) stopTimers();
    wakeCheck();
  }
  // `opener` gets the focus back when the screen closes. A tap does not focus a button in Safari, so a tapped button is
  // passed in.
  function open(l, opener = document.activeElement) {
    if (isOpen(l)) return;
    stack.push(l);
    history.pushState({ sheets: stack.length }, '');
    show(l, opener);
  }
  // Puts another screen in place of the top one, at the same history depth.
  function swap(l) {
    const old = stack.pop();
    stack.push(l);
    hide(old, false);
    show(l, old.opener);
  }
  function back(force) { if (!stack.length) return; quiet = !!force; history.back(); }
  function closeAll() { if (!stack.length) return; quiet = true; history.go(-stack.length); }
  // The tabs: from the box, a tab opens over it; from one tab, the next one takes its place.
  function goTab(l) {
    if (top() === l) return;
    if (!stack.length) open(l); else swap(l);
  }
  // A screen that asks before it closes: the editor with changes, cooking mode with a timer that runs.
  function stays(l) {
    if (l === editor && dirty()) return !confirm('Discard the changes to this recipe?');
    if (l === cook && running()) return !confirm('A timer is running. Stop it and leave cooking mode?');
    return false;
  }
  addEventListener('popstate', e => {
    const n = (e.state && e.state.sheets) || 0, force = quiet;
    quiet = false;
    while (stack.length > n) {
      if (!force && stays(top())) { history.pushState({ sheets: stack.length }, ''); return; }
      hide(stack.pop());
    }
  });
  if (history.state && history.state.sheets) history.replaceState(null, '');
  wide.addEventListener('change', setInert);   // turned or folded with a recipe open
  layers.forEach(l => l.addEventListener('click', e => { if (e.target.closest('[data-close]')) back(); }));
  cookIng.addEventListener('click', e => { if (e.target === cookIng) back(); });   // a tap on the dim part
  pick.addEventListener('click', e => { if (e.target === pick) back(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && stack.length) { e.preventDefault(); back(); }
    if (top() === cook && !e.target.closest('input, textarea') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      (e.key === 'ArrowRight' ? $('cNext') : $('cBack')).click();
    }
  });

  // The tab bar, for anyone signed in, on the box and on the tabs: Recipes, Meal plan, Grocery list and Settings. The
  // meal tabs show once the plan has loaded. Settings opened over another screen (to sign in again during a save) has
  // a back button instead, and so has Settings for someone signed out.
  function drawNav() {
    const s = !!session(), mine = planner(), l = top(), alone = stack.length === 1 && tabLayers.includes(l), on = s && (!l || alone);
    nav.hidden = !on;
    nav.inert = !on;
    nav.style.setProperty('--n', mine ? 4 : 2);
    $('navPlan').hidden = $('navGrocery').hidden = !mine;
    document.body.classList.toggle('has-nav', s);
    nav.querySelectorAll('[data-go]').forEach(b => {
      const here = b.dataset.go === 'box' ? !l : alone && l.id === b.dataset.go;
      if (here) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('sBack').hidden = s && alone && l === settings;
    $('sBackText').textContent = stack.length > 1 ? 'Back' : 'Recipe box';
  }
  nav.addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    const go = b.dataset.go;
    if (go === 'box') { if (top()) closeAll(); else scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' }); }
    else if (go === 'settings') { if (top() !== settings) openSettings(false, true); }
    else if (top() !== $(go)) {
      goTab($(go));
      if (performance.now() - lastPull > 30e3) pull();
    }
  });

  // Keep the screens inside the visual viewport, above the phone keyboard.
  const vv = window.visualViewport;
  if (vv) {
    const fit = () => { root.style.setProperty('--vvh', vv.height + 'px'); root.style.setProperty('--vvt', vv.offsetTop + 'px'); };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    fit();
  }

  let toastT;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on'); t.classList.remove('tap'); t.onclick = null;
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 2800);
  }

  /* ---- keep the screen on while a recipe or cooking mode is open ---- */
  let lock = null;
  const wanted = () => isOpen(view) || isOpen(cook);
  async function wakeCheck() {
    if (!wanted()) { const l = lock; lock = null; if (l) l.release().catch(() => {}); return; }
    if (lock || !navigator.wakeLock) return;
    try {
      const l = await navigator.wakeLock.request('screen');
      if (!wanted() || lock) { l.release().catch(() => {}); return; }
      lock = l;
      l.addEventListener('release', () => { if (lock === l) lock = null; });
    } catch (e) {}   // refused (low battery, page hidden): the screen can sleep as usual
  }
  // the phone drops the lock when the page is hidden
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wakeCheck(); });

  /* ---- one recipe: an index card ---- */
  let viewId = null, half = 'ing';   // half: the ingredients or the steps
  const vBody = $('vBody');
  const host = u => new URL(u).hostname.replace(/^www\./, '');
  const ingLine = text => { const a = D.amount(text); return `<li>${a.qty ? `<strong>${D.esc(a.qty)}</strong>` : ''}<span>${D.esc(a.what)}</span></li>`; };
  function renderView(id) {
    const r = recipes.find(x => x.id === id);
    if (!r) return false;
    if (id !== viewId) half = 'ing';
    viewId = id;
    const me = viewer(), mine = !!me && D.canEdit(r, me);
    const chips = r.tags.map(t => `<span class="chip" style="${paint(colorOf(t))}">${D.esc(t)}</span>`);
    if (r.servings) chips.push(`<span class="chip plain">${D.esc(/^\d/.test(r.servings) ? 'Serves ' + r.servings : r.servings)}</span>`);
    if (!r.shared) chips.push('<span class="chip plain">Not shared</span>');
    const ings = (r.steps.length ? '<h2 class="htitle serif">Ingredients</h2>' : '') + (r.ingredients.length ? `<ul class="lines">${r.ingredients.map(ingLine).join('')}</ul>` : '<p class="empty">No ingredients yet.</p>');
    const steps = `<h2 class="htitle serif">Steps</h2><ol class="lines steps">${r.steps.map((s, i) => `<li><span class="num serif">${i + 1}</span><span>${D.esc(s)}</span></li>`).join('')}</ol>`;
    const seg = r.steps.length
      ? `<div class="seg" role="group" aria-label="Show"><button type="button" data-half="ing" aria-pressed="${half === 'ing'}">Ingredients · ${r.ingredients.length}</button><button type="button" data-half="steps" aria-pressed="${half === 'steps'}">Steps · ${r.steps.length}</button></div>`
      : '';
    let html = `<article class="index" style="${paint(colorOf(r.tags[0]))}"><div class="strip"></div><div class="head">${r.owner ? `<p class="by">Contributed by ${D.esc(r.owner)}</p>` : ''}${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}<h1 class="serif" id="vName">${D.esc(r.name)}</h1></div><div class="rule"></div>${r.steps.length
      // On a wide screen both halves show and the tab bar hides; on the phone the tab bar picks one
      ? `<div class="body both show-${half}">${seg}<div class="half ing">${ings}</div><div class="half steps">${steps}</div></div>`
      : `<div class="body">${ings}</div>`}</article>`;
    const acts = [];
    if (r.steps.length) acts.push(`<button class="pill tomato big" id="cookBtn" type="button">${ICON.pot}<span>Start cooking</span></button>`);
    if (r.ingredients.length) acts.push('<button class="pill big listbtn" id="listBtn" type="button" hidden></button>');   // signed in
    if (me && !mine) {   // someone else's recipe: in the book (it follows their changes) or not
      const kept = shelf.book.some(x => x.id === r.id);
      acts.push(`<button class="pill big bookbtn" type="button" data-${kept ? 'unpull' : 'pull'}="${D.esc(r.id)}"${busyBook ? ' disabled' : ''}>${kept ? 'Remove from my book' : `${ICON.plus}<span>Add to my book</span>`}</button>`);
    }
    if (acts.length) html += `<div class="acts">${acts.join('')}</div>`;
    if (r.notes) html += `<section class="notes"><h2 class="serif">Notes</h2><p>${D.esc(r.notes)}</p></section>`;
    if (r.source) {
      const url = D.safeUrl(r.source);
      html += url
        ? `<a class="source" href="${D.esc(url)}" target="_blank" rel="noopener"><span>From ${D.esc(host(url))}</span>${ICON.out}</a>`
        : `<p class="source">From ${D.esc(r.source)}</p>`;
    }
    vBody.innerHTML = html;
    $('editBtn').hidden = !me;
    $('editBtn').setAttribute('aria-label', mine ? 'Edit recipe' : 'Make your own copy');
    drawListBtn(shown());
    return true;
  }
  // Someone else's shared recipe into the book, or out of it. It is a save of recipes.json, like an edit.
  let busyBook = false;
  async function bookChange(change, btn) {
    if (busyBook || !session()) return;
    busyBook = true;
    if (btn) btn.disabled = true;
    try {
      const out = await worker().save(change, viewer());
      setData(out.data);
      const name = out.recipe ? out.recipe.name : 'The recipe';
      toast(change.type === 'pull' ? `${name} is in your book.` : `${name} is out of your book.`);
    } catch (e) {
      if (!e.code) console.error(e);
      toast(e.code ? e.message : 'Something went wrong.');
      if (e.code === 'signin') signOut();
    } finally {
      busyBook = false;
      renderBox();
      if (viewId && isOpen(view)) renderView(viewId);
    }
  }
  function openView(id, card) {
    if (!renderView(id)) return;
    if (side()) { view.opener = card; view.scrollTop = 0; markOpen(); return; }   // beside the box: show this one instead
    open(view, card);
    wakeCheck();
  }
  vBody.addEventListener('click', e => {
    const b = e.target.closest('[data-half]');
    if (b) {
      half = b.dataset.half;
      renderView(viewId);
      vBody.querySelector(`[data-half="${half}"]`).focus({ preventScroll: true });
    }
    if (e.target.closest('#cookBtn')) openCook();
    if (e.target.closest('#listBtn')) toggleList();
    const p = e.target.closest('[data-pull], [data-unpull]');
    if (p) bookChange(p.dataset.pull ? { type: 'pull', id: p.dataset.pull } : { type: 'unpull', id: p.dataset.unpull }, p);
  });
  // The pencil: your own recipe and your household's are edited; someone else's is copied for you to change.
  $('editBtn').addEventListener('click', () => {
    const r = recipes.find(x => x.id === viewId);
    if (r) openEditor(r, !D.canEdit(r, viewer()));
  });

  /* ---- cooking mode: one step at a time, and a timer when the step names a time ---- */
  let cookId = null, at = 0, tick = 0, audio = null;
  const timers = new Map();   // step number -> { left: seconds, end: the time it ends while it runs, else 0 }
  const cooking = () => recipes.find(x => x.id === cookId);
  const leftOf = t => t.end ? Math.max(0, Math.ceil((t.end - Date.now()) / 1000)) : t.left;
  const running = () => [...timers.values()].some(t => t.end);
  function openCook() {
    const r = recipes.find(x => x.id === viewId);
    if (!r || !r.steps.length) return;
    cookId = r.id;
    at = 0;
    stopTimers();
    renderCook();
    open(cook);
    wakeCheck();
  }
  function renderCook() {
    const r = cooking();
    if (!r || !r.steps.length) return;
    const n = r.steps.length;
    at = Math.min(at, n - 1);
    $('cName').textContent = r.name;
    $('cProgress').innerHTML = r.steps.map((s, k) => `<span${k <= at ? ' class="done"' : ''}></span>`).join('');
    $('cKick').textContent = `Step ${at + 1} of ${n}`;
    $('cText').textContent = r.steps[at];
    $('cBack').disabled = at === 0;
    $('cNext').innerHTML = at === n - 1 ? `${ICON.tick}<span>Done</span>` : `<span>Next step</span>${ICON.next}`;
    $('cIngBtn').hidden = !r.ingredients.length;
    drawTimer();
  }
  function drawTimer() {
    const r = cooking();
    if (!r) return;
    const spec = D.timerFor(r.steps[at] || ''), box = $('cTimer');
    box.hidden = !spec;
    if (spec) {
      const t = timers.get(at), left = t ? leftOf(t) : spec.secs, up = !!t && left === 0;
      $('cWhat').textContent = up ? 'Time’s up' : spec.note;
      $('cClock').textContent = D.clock(left);
      box.classList.toggle('up', up);
      box.classList.toggle('long', spec.secs >= 3600);
      $('cGo').textContent = t && t.end && left ? 'Pause' : up ? 'Again' : t && left < spec.secs ? 'Resume' : 'Start';
    }
    // each timer on another step that has started, in step order: a button that goes back to it
    const others = [...timers].filter(([k]) => k !== at).sort((a, b) => a[0] - b[0]);
    const row = $('cElse');
    row.hidden = !others.length;
    row.innerHTML = others.map(([k, t]) => {
      const left = leftOf(t), st = !left ? 'up' : t.end ? 'runs' : 'paused';
      return `<button type="button" class="${st}" data-step="${k}"><span>Step ${k + 1}</span><b>${left ? D.clock(left) : 'Done'}</b></button>`;
    }).join('');
  }
  function ticking() {
    if (running() && !tick) tick = setInterval(onTick, 250);
    if (!running() && tick) { clearInterval(tick); tick = 0; }
  }
  function onTick() {
    for (const [k, t] of timers) if (t.end && t.end <= Date.now()) { t.end = 0; t.left = 0; ring(k); }
    drawTimer();
    ticking();
  }
  function stopTimers() { timers.clear(); hush(); ticking(); }
  // A sound needs a tap first on a phone: Start makes the sound ready.
  function hearing() {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!audio && C) audio = new C();
      if (audio && audio.state === 'suspended') audio.resume();
    } catch (e) {}
  }
  // Time's up: the bar at the top shows which steps, and the beeps and buzz come back every 2 seconds for a minute
  // or until the bar is tapped.
  const ringing = new Set();
  let alarm = 0, alarmEnd = 0;
  function ring(k) {
    ringing.add(k);
    alarmText();
    $('cAlarm').hidden = false;
    alarmEnd = Date.now() + 60000;
    if (!alarm) { beep(); alarm = setInterval(() => { if (Date.now() >= alarmEnd) { clearInterval(alarm); alarm = 0; } else beep(); }, 2000); }
  }
  function alarmText() {
    const steps = [...ringing].sort((a, b) => a - b).map(s => s + 1);
    $('cAlarmText').textContent = `Time’s up · Step${steps.length > 1 ? 's' : ''} ${steps.join(', ')}`;
  }
  function hush(k) {
    if (!ringing.size) return;
    if (k === undefined) ringing.clear(); else ringing.delete(k);
    if (ringing.size) return alarmText();
    $('cAlarm').hidden = true;
    if (alarm) { clearInterval(alarm); alarm = 0; }
    try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}
  }
  function beep() {
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) {}
    if (!audio) return;
    try {
      const t0 = audio.currentTime;
      [0, 0.4, 0.8].forEach(d => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(0.3, t0 + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.3);
        o.connect(g).connect(audio.destination);
        o.start(t0 + d);
        o.stop(t0 + d + 0.32);
      });
    } catch (e) {}
  }
  $('cGo').addEventListener('click', () => {
    const spec = D.timerFor(cooking().steps[at]);
    if (!spec) return;
    hearing();
    const t = timers.get(at) || { left: spec.secs, end: 0 };
    hush(at);
    if (t.end) { t.left = leftOf(t); t.end = 0; }   // pause
    else { if (t.left <= 0) t.left = spec.secs; t.end = Date.now() + t.left * 1000; }   // start, resume or again
    timers.set(at, t);
    drawTimer();
    ticking();
  });
  $('cReset').addEventListener('click', () => { timers.delete(at); hush(at); drawTimer(); ticking(); });
  $('cAlarm').addEventListener('click', () => hush());
  const goStep = i => { at = i; renderCook(); cook.scrollTop = 0; };
  $('cBack').addEventListener('click', () => { if (at > 0) goStep(at - 1); });
  $('cNext').addEventListener('click', () => { if (at < cooking().steps.length - 1) goStep(at + 1); else back(); });
  $('cElse').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) goStep(+b.dataset.step); });
  $('cIngBtn').addEventListener('click', () => {
    $('ciList').innerHTML = cooking().ingredients.map(ingLine).join('');
    open(cookIng);
  });

  /* ---- add and edit ---- */
  const F = { name: $('fName'), servings: $('fServings'), ingredients: $('fIngredients'), steps: $('fSteps'), notes: $('fNotes'), source: $('fSource') };
  const eSave = $('eSave'), eCancel = $('eCancel'), eDelete = $('eDelete'), eError = $('eError'), cats = $('fCats'), newRow = $('fNewRow'), fNew = $('fNew');
  let editId = null, copyOf = null, start = '', busy = false, armT = 0;
  let shareOn = true;   // the "Share with the family" switch
  let picked = [];   // the categories picked, in the order they were picked; the first one colors the card
  let made = [];     // categories made with New in this editor
  const values = () => ({ ...Object.fromEntries(Object.keys(F).map(k => [k, F[k].value])), tags: picked.join(', '), shared: shareOn });
  const dirty = () => JSON.stringify(values()) !== start;
  function drawCats() {
    const names = categories().map(c => c.name);
    for (const t of [...picked, ...made]) if (!names.some(n => same(n, t))) names.push(t);
    const on = n => picked.some(p => same(p, n));
    cats.innerHTML = `<button type="button" data-cat="" aria-pressed="${!picked.length}" style="${paint(BUTTER)}"><i></i><span>None</span></button>`
      + names.map(n => `<button type="button" data-cat="${D.esc(n)}" aria-pressed="${on(n)}" style="${paint(colorOf(n))}"><i></i><span>${D.esc(n)}</span></button>`).join('')
      + `<button type="button" class="new" data-new aria-expanded="${!newRow.hidden}">${ICON.plus}<span>New</span></button>`;
  }
  cats.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-new')) {
      newRow.hidden = !newRow.hidden;
      drawCats();
      if (!newRow.hidden) fNew.focus();
      return;
    }
    const n = b.dataset.cat;
    picked = !n ? [] : picked.some(p => same(p, n)) ? picked.filter(p => !same(p, n)) : [...picked, n];
    drawCats();
    cats.querySelector(`[data-cat="${CSS.escape(n)}"]`).focus({ preventScroll: true });
  });
  function addCat() {
    const n = fNew.value.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (!n) { fNew.focus(); return; }
    const known = [...categories().map(c => c.name), ...made].find(c => same(c, n)) || n;
    if (!made.some(c => same(c, known)) && !categories().some(c => same(c.name, known))) made.push(known);
    if (!picked.some(p => same(p, known))) picked.push(known);
    fNew.value = '';
    newRow.hidden = true;
    drawCats();
    cats.querySelector(`[data-cat="${CSS.escape(known)}"]`).focus({ preventScroll: true });
  }
  $('fNewAdd').addEventListener('click', addCat);
  fNew.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addCat(); } });

  // "One per line · 5 ingredients" under the labels, so a long step that wraps still counts as one.
  function counts() {
    const n = D.lines(F.ingredients.value).length, s = D.lines(F.steps.value).length;
    $('fIngHint').textContent = `One per line${n ? ' · ' + plural(n, 'ingredient') : ''}`;
    $('fStepHint').textContent = `One per line${s ? ' · ' + plural(s, 'step') : ''}. A time like “15 minutes” gets a timer.`;
  }
  function grow(ta) {
    const y = editor.scrollTop;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 3 + 'px';
    editor.scrollTop = y;
  }
  function drawShareSwitch() {
    $('fShare').setAttribute('aria-checked', shareOn);
    $('fShareHint').textContent = shareOn ? 'Everyone with an account can see it and add it to their book.' : 'Only you and the person you share a meal plan with see it.';
  }
  $('fShare').addEventListener('click', () => { shareOn = !shareOn; drawShareSwitch(); });
  // `copy`: someone else's recipe, as the start of your own version of it.
  function openEditor(r, copy) {
    if (!session()) return openSettings(true);
    editId = r && !copy ? r.id : null;
    copyOf = r && copy ? r.id : null;
    const v = D.toForm(r || {});
    if (copy) { v.name = D.versionName(r.name, viewer()); v.shared = true; }
    for (const k in F) { F[k].value = v[k]; F[k].classList.remove('bad'); }
    shareOn = v.shared;
    drawShareSwitch();
    picked = r ? r.tags.slice() : [];
    made = [];
    fNew.value = '';
    newRow.hidden = true;
    drawCats();
    start = JSON.stringify(values());
    $('eTitle').textContent = copy ? 'Your copy' : r ? 'Edit recipe' : 'New recipe';
    eDelete.hidden = !editId;
    $('eMany').hidden = !!r;   // a new recipe can be many, from a file
    disarm();
    error('');
    open(editor);
    editor.querySelectorAll('textarea').forEach(grow);
    counts();
    if (!r) F.name.focus({ preventScroll: true });   // a new recipe starts with the keyboard up
  }
  function error(msg, withSettings) {
    eError.hidden = !msg;
    eError.innerHTML = msg ? D.esc(msg) + (withSettings ? '<br><button class="pill solid" type="button" data-settings>Sign in again</button>' : '') : '';
    if (msg) editor.scrollTop = 0;
  }
  eError.addEventListener('click', e => { if (e.target.closest('[data-settings]')) openSettings(true); });
  function setBusy(btn, label) {
    busy = !!label;
    [eSave, eCancel, eDelete].forEach(b => { b.disabled = busy; });
    btn.textContent = label || btn.dataset.label;
  }
  eSave.dataset.label = 'Save';
  eDelete.dataset.label = 'Delete recipe';
  const failText = (e, what) => {
    if (!e.code) console.error(e);
    return `${e.code ? e.message : 'Something went wrong.'} ${what}`;
  };
  // A save that failed because the sign-in ended: sign out here too, and offer to sign in again.
  const needsSignIn = e => { if (e.code === 'signin') signOut(); return e.code === 'signin'; };

  editor.querySelectorAll('textarea').forEach(ta => ta.addEventListener('input', () => { grow(ta); counts(); }));
  // A pasted list loses its leading "-", "•", "*", "1." and "1)" marks, one item on each line.
  [F.ingredients, F.steps].forEach(ta => ta.addEventListener('paste', e => {
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!text) return;
    const many = /[\r\n]/.test(text.trim());
    if (!many && D.cleanLine(text) === text.trim()) return;
    e.preventDefault();
    let clean = D.cleanPaste(text);
    const s = ta.selectionStart, end = ta.selectionEnd, v = ta.value;
    if (many) {   // a list starts and ends on its own lines
      if (s > 0 && v[s - 1] !== '\n') clean = '\n' + clean;
      if (end < v.length && v[end] !== '\n') clean += '\n';
    }
    if (!document.execCommand('insertText', false, clean)) {
      ta.setRangeText(clean, s, end, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }));
  // The return key moves to the next field instead of saving.
  [[F.name, F.servings], [F.servings, F.ingredients]].forEach(([el, next]) => el.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    next.focus();
  }));
  F.source.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); F.source.blur(); } });
  F.name.addEventListener('input', () => F.name.classList.remove('bad'));

  eCancel.addEventListener('click', () => {
    if (dirty() && !confirm('Discard the changes to this recipe?')) return;
    back(true);
  });
  eSave.addEventListener('click', async () => {
    if (busy) return;
    const v = values();
    if (!v.name.trim()) { error('Give the recipe a name.'); F.name.classList.add('bad'); F.name.focus(); return; }
    if (!session()) return openSettings(true);
    error('');
    setBusy(eSave, 'Saving…');
    try {
      const change = copyOf ? { type: 'copy', id: copyOf, form: v } : editId ? { type: 'edit', id: editId, form: v } : { type: 'add', form: v };
      const out = await worker().save(change, viewer());
      start = JSON.stringify(values());
      setData(out.data);
      toast(copyOf ? 'Saved your copy. The site updates in about a minute.' : 'Saved. The site updates in about a minute.');
      if (top() !== editor) return;
      renderView(out.recipe.id);
      if (editId || copyOf) back(true);   // the recipe under the editor now shows the change, or the copy
      else { swap(view); wakeCheck(); }   // show the new recipe
    } catch (e) {
      error(failText(e, 'The change is not saved.'), needsSignIn(e));
    } finally {
      setBusy(eSave, '');
    }
  });
  function disarm() { clearTimeout(armT); eDelete.classList.remove('armed'); eDelete.textContent = eDelete.dataset.label; }
  // Delete asks for a second tap.
  eDelete.addEventListener('click', async () => {
    if (busy) return;
    if (!eDelete.classList.contains('armed')) {
      eDelete.classList.add('armed');
      eDelete.textContent = 'Tap again to delete';
      armT = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    if (!session()) return openSettings(true);
    error('');
    setBusy(eDelete, 'Deleting…');
    try {
      const out = await worker().save({ type: 'delete', id: editId }, viewer());
      viewId = null;
      setData(out.data);
      toast(out.recipe ? `Deleted ${out.recipe.name}.` : 'Deleted.');
      closeAll();
    } catch (e) {
      error(failText(e, 'The recipe is not deleted.'), needsSignIn(e));
    } finally {
      setBusy(eDelete, '');
    }
  });

  /* ---- import: many recipes at once, from a file an AI assistant made by following import.txt ---- */
  const iGo = $('iGo'), iCancel = $('iCancel'), iError = $('iError'), iPaste = $('iPaste'), iList = $('iList');
  let found = [], iShareOn = true, iBusy = false, iT = 0;   // found: the file's recipes as the editor's fields, with `on` and `dup`
  const askText = () => `I want to import recipes into the Dorrance family recipe book. Read ${location.origin}/recipes/import.txt and follow it to make the import file. I'll send you the recipes next.`;
  function openImport() {
    if (!session()) return openSettings(true);
    if (top() === editor && dirty() && !confirm('Discard the changes to this recipe?')) return;
    clearTimeout(iT);
    iPaste.value = '';
    $('iPasteHint').textContent = '';
    found = [];
    iShareOn = true;
    iErr('');
    $('iPrompt').textContent = askText();
    drawFound();
    if (top() === editor) swap(importer); else open(importer);
  }
  function iErr(msg, withSettings) {
    iError.hidden = !msg;
    iError.innerHTML = msg ? D.esc(msg) + (withSettings ? '<br><button class="pill solid" type="button" data-settings>Sign in again</button>' : '') : '';
    if (msg) importer.scrollTop = 0;
  }
  iError.addEventListener('click', e => { if (e.target.closest('[data-settings]')) openSettings(true); });
  const many = (n, word) => n ? `${n} ${word}${n === 1 ? '' : 's'}` : `no ${word}s`;
  function drawCounts() {
    const n = found.filter(f => f.on).length;
    iGo.disabled = iBusy || !n;
    iGo.textContent = iBusy ? 'Importing…' : n ? `Import ${n}` : 'Import';
    iCancel.disabled = iBusy;
    $('iAll').textContent = n === found.length ? 'Untick all' : 'Tick all';
    $('iShare').setAttribute('aria-checked', iShareOn);
    $('iShareHint').textContent = iShareOn ? 'Everyone with an account can see them and add them to their book.' : 'Only you and the person you share a meal plan with see them.';
  }
  function drawFound() {
    $('iFound').hidden = !found.length;
    $('iCount').textContent = `${found.length} recipe${found.length === 1 ? '' : 's'} in the file`;
    iList.innerHTML = found.map((f, i) => {
      const bits = [many(D.lines(f.ingredients).length, 'ingredient'), many(D.lines(f.steps).length, 'step')];
      if (f.tags) bits.push(f.tags);
      return `<li><label><input type="checkbox" data-i="${i}"${f.on ? ' checked' : ''}><span class="what"><b>${D.esc(f.name)}</b>`
        + `<small>${D.esc(bits.join(' · '))}</small>${f.dup ? '<small class="dup">Already in your book</small>' : ''}</span></label></li>`;
    }).join('');
    drawCounts();
  }
  // Reads what is in the paste box: a file that was chosen lands there too.
  function readImport() {
    iErr('');
    $('iPasteHint').textContent = '';
    found = [];
    if (iPaste.value.trim()) {
      try {
        const { forms, skipped } = D.parseImport(iPaste.value);
        const have = new Set(shelf.book.map(r => D.slug(r.name)));
        found = forms.map(f => { const dup = have.has(D.slug(f.name)); return { ...f, dup, on: !dup }; });
        if (skipped.length) $('iPasteHint').textContent = `${skipped.length} with no name left out`;
      } catch (e) {
        if (!e.code) console.error(e);
        iErr(e.code ? e.message : 'Something went wrong.');
      }
    }
    drawFound();
  }
  iPaste.addEventListener('input', () => { clearTimeout(iT); iT = setTimeout(readImport, 350); });
  $('iPick').addEventListener('click', () => $('iFile').click());
  $('iFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5e6) { iErr('This file is too big. An import file is text, well under 5 MB.'); return; }
    iPaste.value = await file.text();
    readImport();
  });
  $('iCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(askText()); toast('Copied. Paste it into your AI chat.'); }
    catch (e) {   // no clipboard: select the message so the phone's Copy works
      const range = document.createRange();
      range.selectNodeContents($('iPrompt'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }
  });
  iList.addEventListener('change', e => { const b = e.target.closest('[data-i]'); if (b) { found[+b.dataset.i].on = b.checked; drawCounts(); } });
  $('iAll').addEventListener('click', () => { const on = found.some(f => !f.on); found.forEach(f => { f.on = on; }); drawFound(); });
  $('iShare').addEventListener('click', () => { iShareOn = !iShareOn; drawCounts(); });
  iCancel.addEventListener('click', () => back(true));
  $('eMany').addEventListener('click', openImport);
  $('sImportBtn').addEventListener('click', openImport);
  // All the ticked recipes in one save, so one commit.
  iGo.addEventListener('click', async () => {
    const forms = found.filter(f => f.on);
    if (iBusy || !forms.length) return;
    if (!session()) return openSettings(true);
    iErr('');
    iBusy = true;
    drawCounts();
    try {
      const out = await worker().save({ type: 'import', forms, shared: iShareOn }, viewer());
      setData(out.data);
      toast(`Imported ${forms.length === 1 ? out.recipe.name : forms.length + ' recipes'}. The site updates in about a minute.`);
      found = [];
      iPaste.value = '';
      closeAll();
    } catch (e) {
      iErr(failText(e, 'Nothing was imported.'), needsSignIn(e));
    } finally {
      iBusy = false;
      drawCounts();
    }
  });

  /* ---- settings: the account, the theme, and for the admin, the accounts ---- */
  const aForm = $('aForm'), aName = $('aName'), aPass = $('aPass'), aGo = $('aGo'), aSwap = $('aSwap'), aResult = $('aResult');
  const say = $('sSay'), people = $('sPeople'), waitList = $('sWaitList');
  let making = false;   // the form asks for a new account instead of signing in
  let folks = [];       // the admin's list: { key, name, status, created }
  const problem = e => { if (!e.code) console.error(e); return e.code ? e.message : 'Something went wrong.'; };
  function result(msg, ok) {
    aResult.hidden = !msg;
    aResult.textContent = msg;
    aResult.classList.toggle('ok', !!ok);
  }
  function said(msg) { say.hidden = !msg; say.textContent = msg; }
  function account() {
    const s = session();
    $('sMe').hidden = !s;
    $('sImport').hidden = !s;
    $('aBox').hidden = !!s;
    $('sAdmin').hidden = !(s && s.admin);
    if (s) {
      $('sMeAv').textContent = (s.name[0] || '?').toUpperCase();
      $('sMeAv').style.cssText = paint(face(s.name));
      $('sMeName').textContent = s.name;
      $('sMeRole').textContent = s.admin ? 'Admin · signed in' : 'Signed in';
    }
    $('aTitle').textContent = making ? 'Ask for an account' : 'Sign in';
    $('aNote').textContent = making ? 'Pick a name and a password. The admin approves new accounts.' : 'Anyone can read the recipes. Sign in to add and change them.';
    aPass.autocomplete = making ? 'new-password' : 'current-password';
    aPass.placeholder = making ? '8 characters or more' : '';
    aGo.textContent = making ? 'Ask for an account' : 'Sign in';
    aSwap.textContent = making ? 'I have an account' : 'New here? Ask for an account';
    $('addBtn').hidden = !s;
    $('signInBtn').hidden = !!s;
    drawNav();
    renderBox();
  }
  // `tabbed`: from the tab bar, where Settings is a tab; else it opens over the screen that is open.
  function openSettings(need, tabbed) {
    $('sNeed').hidden = !need;
    result('');
    said('');
    making = false;
    account();
    if (session() && session().admin) loadFolks();
    if (session()) { pull(); loadOthers(); }   // who shares, and who can be asked
    applyTheme();
    if (tabbed) goTab(settings); else open(settings);
  }
  aSwap.addEventListener('click', () => { making = !making; result(''); account(); });
  aName.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); aPass.focus(); } });
  aForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (aGo.disabled) return;
    const name = aName.value.trim().replace(/\s+/g, ' '), pw = aPass.value;
    if (!name) { result('Type your name.'); aName.focus(); return; }
    if (!pw) { result('Type your password.'); aPass.focus(); return; }
    if (making && pw.length < 8) { result(A.fail('password').message); aPass.focus(); return; }
    aGo.disabled = aSwap.disabled = true;
    aGo.textContent = making ? 'Asking…' : 'Signing in…';
    result('');
    try {
      if (making) {
        const out = await A.api().signup(name, pw);
        making = false;
        aPass.value = '';
        result(`Thanks, ${out.name}. Your account is waiting for ${out.admin}. You can sign in once it’s approved.`, true);
      } else {
        const out = await A.signIn(name, pw);
        aPass.value = '';
        $('sNeed').hidden = true;
        toast(`Signed in as ${out.name}.`);
        if (out.admin) loadFolks();
        load();   // the newest copy, from GitHub
        pull();   // the meal plan
      }
    } catch (err) {
      result(problem(err));
    } finally {
      aGo.disabled = aSwap.disabled = false;
      account();
    }
  });
  // A sign-in that ended on the Worker: forget it here too.
  function signOut() { A.keep(null); dot(0); dropMeals(); account(); }
  $('aOut').addEventListener('click', () => {
    A.signOut();   // here, and on the Worker
    dot(0);
    dropMeals();
    folks = [];
    account();
    said('');
    result('Signed out.', true);
  });

  // A dot on Settings in the tab bar while accounts wait for the admin, or someone asked to share a meal plan. Counting
  // the accounts is a KV list on the Worker, so a page load asks at most once every 6 hours; opening Settings always asks.
  let waitN = 0;
  function showDot(n) { waitN = n; drawDot(); }
  function drawDot() {
    const b = $('navSettings'), v = shown(), asked = v && v.share && v.share.invite;
    b.classList.toggle('dot', waitN > 0 || !!asked);
    b.setAttribute('aria-label', asked ? `Settings, ${asked.name} asked to share a meal plan` : waitN > 0 ? `Settings, ${plural(waitN, 'account')} waiting for approval` : 'Settings');
  }
  function dot(n) {
    showDot(n);
    const s = session();
    if (s && s.admin) store.set(WAITING, JSON.stringify({ name: s.name, n, at: Date.now() }));
    else store.del(WAITING);
  }
  async function checkWaiting() {
    const s = session();
    if (!s || !s.admin) return;
    let last = null;
    try { last = JSON.parse(store.get(WAITING)); } catch (e) {}
    if (last && last.name === s.name && Date.now() - last.at < 6 * 3600e3) return showDot(last.n);
    try { dot((await A.mine().me()).waiting); } catch (e) { if (e.code === 'signin') signOut(); }
  }
  async function loadFolks() {
    people.innerHTML = '<p class="nobody">Loading…</p>';
    waitList.innerHTML = '';
    $('sWaiting').hidden = true;
    try { folks = await A.mine().users(); }
    catch (e) {
      if (e.code === 'signin') signOut();
      people.innerHTML = `<p class="nobody">${D.esc(problem(e))}</p>`;
      return;
    }
    drawFolks();
  }
  // "today", "yesterday" or "on Oct 22"
  const day = iso => {
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return '';
    const days = Math.round((new Date().setHours(12, 0, 0, 0) - d) / 864e5);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : 'on ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const avatar = p => `<span class="av serif" aria-hidden="true" style="${paint(face(p.name))}">${D.esc((p.name[0] || '?').toUpperCase())}</span>`;
  function drawFolks() {
    const waiting = folks.filter(p => p.status === 'pending'), approved = folks.filter(p => p.status !== 'pending');
    waiting.sort((a, b) => a.name.localeCompare(b.name));
    approved.sort((a, b) => a.name.localeCompare(b.name));
    dot(waiting.length);
    $('sWaiting').hidden = !waiting.length;
    waitList.innerHTML = waiting.map(p => {
      const k = D.esc(p.key), asked = day(p.created);
      return `<div class="box waiting"><div class="row">${avatar(p)}<span class="who"><b>${D.esc(p.name)}</b><small>Asked for an account${asked ? ' ' + asked : ''}</small></span></div>`
        + `<div class="two"><button class="pill solid" type="button" data-approve="${k}">Approve</button><button class="pill" type="button" data-remove="${k}" data-label="Deny" data-armed="Tap again to deny" aria-label="Deny ${D.esc(p.name)}">Deny</button></div></div>`;
    }).join('');
    people.innerHTML = approved.length
      ? approved.map(p => `<div class="row">${avatar(p)}<span class="who"><b>${D.esc(p.name)}</b></span><button class="pill" type="button" data-remove="${D.esc(p.key)}" data-label="Remove" data-armed="Tap again" aria-label="Remove ${D.esc(p.name)}">Remove</button></div>`).join('')
      : '<p class="nobody">No other accounts yet.</p>';
  }
  function unarm() {
    settings.querySelectorAll('[data-remove].armed').forEach(b => {
      b.classList.remove('armed');
      b.textContent = b.dataset.label;
      b.setAttribute('aria-label', b.getAttribute('aria-label').replace(/^Tap again to (\w+)/, (m, w) => w[0].toUpperCase() + w.slice(1)));
    });
  }
  $('sAdmin').addEventListener('click', async e => {
    const b = e.target.closest('button'), s = session();
    if (!b || b.disabled || !s) return;
    const key = b.dataset.approve ?? b.dataset.remove, p = folks.find(x => x.key === key);
    if (!p) return;
    if (b.dataset.remove != null && !b.classList.contains('armed')) {   // Deny and Remove ask for a second tap
      unarm();
      b.classList.add('armed');
      b.textContent = b.dataset.armed;
      b.setAttribute('aria-label', `Tap again to ${b.dataset.label.toLowerCase()} ${p.name}`);
      return;
    }
    unarm();
    b.disabled = true;
    said('');
    try {
      if (b.dataset.approve != null) {
        await A.mine().approve(key);
        p.status = 'approved';
        said(`${p.name} can sign in now.`);
      } else {
        await A.mine().remove(key);
        folks = folks.filter(x => x !== p);
        said(p.status === 'pending' ? `${p.name}’s request is gone.` : `${p.name} can no longer sign in.`);
        const v = shown();
        if (v && v.share && v.share.with && v.share.with.key === key) pull();   // the admin shared with them: no more
        loadOthers();   // one chip less to ask
      }
      drawFolks();
    } catch (err) {
      said(problem(err));
      if (err.code === 'signin') signOut();
      else if (err.code === 'nobody') loadFolks();
      else b.disabled = false;
    }
  });

  /* ---- the meal plan and the grocery list: tabs for everyone signed in, and a plan two people can share ---- */
  // The Worker keeps them (worker/meals.js), and meals.js has the data and the ops. This phone keeps the last answer and
  // the changes that are not sent yet under "recipes-meals", so the tabs show at once, and it shows the answer with those
  // changes on top. The changes go in batches: one POST at a time, at most one each 1.2 s. A GET only reads KV, so a page
  // load and the 30 s refresh while a meal screen shows cost no writes.
  let meals = null;   // { name, state: the Worker's answer { people, days, list, share }, queue: [ops] }
  let week = 0, pickDate = null, shopping = [], sharing = false;   // sharing: an ask, a yes or a stop is on its way
  // The batch window and the age of the last GET use performance.now(), which only goes forward. `ticks` orders the
  // GETs and the POSTs.
  let sending = false, sendT = 0, retryT = 0, tries = 0, lastSent = -Infinity, lastPull = -Infinity, ticks = 0, lastPost = 0, pulls = 0;
  const mealsApi = () => M.api(session() && session().token);
  const planner = () => !!(meals && session() && meals.name === session().name);
  const onMeals = () => mealLayers.includes(top());
  const utcToday = () => new Date().toISOString().slice(0, 10);   // the Worker's day
  const saveMeals = () => { if (meals) store.set(MEALS, JSON.stringify(meals)); };
  function shown() {
    if (!planner()) return null;
    return { ...meals.state, ...M.apply(meals.state, meals.queue, meals.name, utcToday()) };
  }
  function readMeals() {
    const s = session();
    let c = null;
    try { c = JSON.parse(store.get(MEALS)); } catch (e) {}
    if (!s || !c || c.name !== s.name || !c.state || typeof c.state !== 'object' || !Array.isArray(c.queue)) { store.del(MEALS); return; }
    const people = Array.isArray(c.state.people) ? c.state.people.filter(n => typeof n === 'string') : [s.name];
    meals = { name: c.name, state: { ...c.state, people }, queue: c.queue.map(M.check).filter(Boolean) };
  }
  // Signed out: the tabs go, and so does what this phone kept.
  function dropMeals() {
    meals = null;
    store.del(MEALS);
    clearTimeout(sendT);
    clearTimeout(retryT);
    sendT = retryT = tries = 0;
    mealsNote('');
    if (stack.some(l => mealLayers.includes(l))) closeAll();
    drawMeals();
  }
  function mealsNote(msg) { ['pNote', 'gNote'].forEach(id => { $(id).hidden = !msg; $(id).textContent = msg; }); }
  // One change: it shows at once and goes in the next batch.
  function change(op) {
    const o = M.check(op);
    if (!o || !planner()) return false;
    meals.queue.push(o);
    saveMeals();
    drawMeals();
    later();
    return true;
  }
  function later() {
    if (sendT || retryT || sending || !planner() || !meals.queue.length) return;
    sendT = setTimeout(() => { sendT = 0; send(); }, Math.max(0, lastSent + 1200 - performance.now()));
  }
  function retryNow() {
    if (retryT) { clearTimeout(retryT); retryT = 0; }
    later();
  }
  // `keepalive` sends while the page closes.
  async function send(keepalive) {
    if (sending || !planner() || !meals.queue.length) return;
    const mine = meals, batch = mine.queue.slice(0, M.MAX.ops);
    sending = true;
    lastSent = performance.now();
    let wait = 0;
    try {
      const out = await mealsApi().send(batch, keepalive);
      if (meals !== mine) return;
      mine.queue.splice(0, batch.length);
      mine.state = out;
      lastPost = ++ticks;
      tries = 0;
      mealsNote('');
      saveMeals();
      drawMeals();
    } catch (e) {
      if (meals !== mine) return;
      if (e.code === 'busy') wait = 1500;   // the other phone saved in the same second
      else if (e.code === 'body') { mine.queue.splice(0, batch.length); saveMeals(); pull(); }   // drop it: the Worker's copy is right
      else if (e.code === 'signin') signOut();
      else {   // no connection, the day's free writes are used up, or the Worker failed: keep the changes and try later
        if (!e.code) console.error(e);
        wait = e.code === 'full' ? 300e3 : [5e3, 15e3, 30e3, 60e3][Math.min(tries++, 3)];
        mealsNote(`${e.code ? e.message : 'Something went wrong.'} Your changes are kept on this phone and sent later.`);
      }
    } finally {
      sending = false;
      if (meals === mine) {
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
    lastPull = performance.now();
    try {
      const out = await mealsApi().get();
      const now = session();
      if (n !== pulls || !now || now.name !== s.name || lastPost > at) return;
      if (planner()) meals.state = out; else meals = { name: s.name, state: out, queue: [] };
      saveMeals();
      drawMeals();
      later();
    } catch (e) {
      if (n !== pulls) return;
      if (e.code === 'signin') signOut();
    }   // no connection: the copy on this phone stays
  }
  document.addEventListener('visibilitychange', () => {
    if (!planner()) return;
    if (document.visibilityState === 'hidden') {
      if (meals.queue.length && !sending) { clearTimeout(sendT); sendT = 0; send(true); }
    } else {
      retryNow();
      if (onMeals()) pull();
    }
  });
  addEventListener('online', () => { if (planner()) retryNow(); });
  setInterval(() => { if (document.visibilityState === 'visible' && onMeals()) pull(); }, 30e3);

  // A redraw replaces the buttons: the focus goes to the same one in the new list, or to the one that took its place.
  function refocus(draw) {
    const a = document.activeElement, d = a && a.dataset, q = (k, v) => `[data-${k}="${CSS.escape(v)}"]`;
    const want = !d ? [] : d.key != null ? [q('key', d.key)] : d.clear ? [q('clear', d.clear), q('plan', d.clear)]
      : d.plan ? [q('plan', d.plan), q('clear', d.plan)] : d.open ? [q('open', d.open)] : d.week ? [q('week', d.week)]
      : d.drop ? [q('drop', d.drop), '#gAddRec'] : d.ask ? [q('ask', d.ask)] : d.share ? [q('share', d.share), '#sMeal [data-share]', '#sMeal [data-ask]'] : [];
    draw();
    if (!want.length || document.contains(a)) return;
    const b = want.map(s => document.querySelector(s)).find(Boolean);
    if (b) b.focus({ preventScroll: true });
  }
  let house = '';   // who the book is for: the person and their household, as last drawn
  function drawMeals() {
    const v = shown(), h = viewer(), now = h ? `${h.key}|${h.partner || ''}` : '';
    if (now !== house) {   // a new household: the book is someone else's too, or no longer
      house = now;
      if (loaded) { renderBox(); if (viewId && isOpen(view)) renderView(viewId); }
    }
    refocus(() => {
      if (v) { drawPlan(v); drawGrocery(v); }
      drawListBtn(v);
      drawShare(v);
    });
    drawNav();
    drawDot();
  }

  // The meal plan: Monday to Sunday, this week or the next. Each day has a recipe, a note or nothing.
  const by = name => `<span class="av by" role="img" aria-label="Planned by ${D.esc(name)}" style="${paint(face(name))}">${D.esc((name[0] || '?').toUpperCase())}</span>`;
  function drawPlan(v) {
    const now = new Date(), days = M.week(now, week), today = M.iso(now);
    $('pWho').textContent = 'Dinners for ' + v.people.join(' and ');
    $('pFaces').innerHTML = v.people.map(name => avatar({ name })).join('');
    $('pWeeks').innerHTML = [0, 1].map(n => `<button type="button" data-week="${n}" aria-pressed="${n === week}"><b>${n ? 'Next week' : 'This week'}</b><span>${M.span(M.week(now, n))}</span></button>`).join('');
    $('pDays').innerHTML = days.map(d => {
      const p = v.days[d.date], x = `<button class="x" type="button" data-clear="${d.date}" aria-label="Clear ${d.long}">${ICON.x}</button>`;
      let it;
      if (p && p.recipe) {
        const r = recipes.find(y => y.id === p.recipe), name = D.esc(r ? r.name : p.name);   // a recipe deleted since keeps its name
        const what = r ? `<button class="what serif" type="button" data-open="${D.esc(r.id)}">${name}</button>` : `<span class="what serif">${name}</span>`;
        it = `<div class="dinner" style="${paint(colorOf(r && r.tags[0]))}">${what}${by(p.by)}${x}</div>`;
      } else if (p) it = `<div class="dinner note"><span class="what">${D.esc(p.note)}</span>${by(p.by)}${x}</div>`;
      else it = `<button class="planit" type="button" data-plan="${d.date}" aria-label="Plan dinner on ${d.long}">${ICON.plan}<span>Plan dinner</span></button>`;
      return `<li data-date="${d.date}"><span class="vh">${d.long}, ${d.month} ${d.num}${d.today ? ', today' : ''}</span>`
        + `<div class="date${d.today ? ' today' : ''}" aria-hidden="true"><span class="dw">${d.day}</span><span class="dn serif">${d.num}</span></div>${it}</li>`;
    }).join('');
    // From today on, the recipes with ingredients that are not on the grocery list yet
    const planned = days.map(d => v.days[d.date]).filter(p => p && p.recipe), listed = new Set(v.list.recipes.map(x => x.id));
    shopping = [...new Set(days.filter(d => d.date >= today).map(d => v.days[d.date]).filter(p => p && p.recipe).map(p => p.recipe))]
      .map(id => recipes.find(r => r.id === id)).filter(r => r && r.ingredients.length && !listed.has(r.id));
    $('pShop').hidden = !planned.length;
    $('pShopText').textContent = shopping.length ? `Put ${plural(shopping.length, 'dinner')} on the grocery list` : 'Open the grocery list';
  }
  $('pWeeks').addEventListener('click', e => { const b = e.target.closest('[data-week]'); if (b) { week = +b.dataset.week; drawMeals(); } });
  $('pDays').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.open) openView(b.dataset.open, b);
    else if (b.dataset.clear) change({ op: 'day', date: b.dataset.clear });
    else if (b.dataset.plan) openPick(b.dataset.plan, b);
  });
  $('pShop').addEventListener('click', () => {
    for (const r of shopping) change({ op: 'add', recipe: r.id, name: r.name, keys: M.keysOf(r, D.amount) });
    goTab(grocery);
  });

  // The sheet that picks a dinner: a recipe, or a note such as "Leftovers"
  function openPick(date, opener) {
    const d = M.week(new Date(), week).find(x => x.date === date);
    if (!d || !planner()) return;
    pickDate = date;
    $('pkTitle').textContent = `Dinner on ${d.long}, ${d.month} ${d.num}`;
    $('pkQ').value = '';
    $('pkNote').value = '';
    drawPick();
    open(pick, opener);
  }
  function drawPick() {
    const t = $('pkQ').value.trim(), low = t.toLowerCase();
    const list = shelf.book.filter(r => r.name.toLowerCase().includes(low)).sort((a, b) => a.name.localeCompare(b.name));
    $('pkList').innerHTML = list.length
      ? list.map(r => `<li><button type="button" data-pick="${D.esc(r.id)}" style="${paint(colorOf(r.tags[0]))}"><i></i><span>${D.esc(r.name)}</span></button></li>`).join('')
      : `<li class="none">${t ? `No recipe has “${D.esc(t)}”.` : 'No recipes yet.'}</li>`;
    $('pkList').scrollTop = 0;
  }
  // The sheet closes, and the focus goes to the day that was just planned.
  function dayPicked(date) {
    addEventListener('popstate', () => { const b = $('pDays').querySelector(`[data-date="${date}"] button`); if (b) b.focus({ preventScroll: true }); }, { once: true });
    back();
  }
  $('pkQ').addEventListener('input', drawPick);
  $('pkQ').addEventListener('keydown', e => { if (e.key === 'Enter') $('pkQ').blur(); });
  $('pkList').addEventListener('click', e => {
    const b = e.target.closest('[data-pick]'), r = b && recipes.find(x => x.id === b.dataset.pick);
    if (r && change({ op: 'day', date: pickDate, recipe: r.id, name: r.name })) dayPicked(pickDate);
  });
  $('pkForm').addEventListener('submit', e => {
    e.preventDefault();
    const note = $('pkNote').value.trim();
    if (!note) { $('pkNote').focus(); return; }
    if (change({ op: 'day', date: pickDate, note })) dayPicked(pickDate);
  });

  // The grocery list: one line for each item, so "Buns" from two recipes is one line. Ticked items go to "Got it".
  function drawGrocery(v) {
    const L = v.list, lines = M.groceries(L, recipes, D.amount), get = lines.filter(l => !l.got), got = lines.filter(l => l.got);
    const n = L.recipes.length;
    $('gSum').textContent = lines.length || n ? [n ? plural(n, 'recipe') : '', `${get.length} to get`].filter(Boolean).join(' · ') : 'Nothing to get';
    $('gChips').innerHTML = L.recipes.map(x => {
      const r = recipes.find(y => y.id === x.id), name = D.esc(r ? r.name : x.name);
      return `<span class="gchip"><span>${name}</span><button type="button" data-drop="${D.esc(x.id)}" aria-label="Take ${name} off the list">${ICON.off}</button></span>`;
    }).join('') + `<button class="addrec" id="gAddRec" type="button">${ICON.plus}<span>Add a recipe</span></button>`;
    // under the name: the amounts, and which recipes need it
    const item = l => {
      const sub = l.got ? '' : [l.qty.join(' + '), l.for.length ? 'For ' + l.for.join(', ') : 'Extra'].filter(Boolean).join(' · ');
      return `<li><label><input type="checkbox" data-key="${D.esc(l.key)}"${l.got ? ' checked' : ''}><span class="t"><span class="nm">${D.esc(l.name)}</span>${sub ? `<small>${D.esc(sub)}</small>` : ''}</span></label></li>`;
    };
    $('gGet').hidden = !get.length;
    $('gGetList').innerHTML = get.map(item).join('');
    $('gGot').hidden = !got.length;
    $('gGotList').innerHTML = got.map(item).join('');
    $('gEmpty').hidden = lines.length > 0;
  }
  $('gChips').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'gAddRec') closeAll();   // to the recipe box
    else if (b.dataset.drop) change({ op: 'drop', recipe: b.dataset.drop });
  });
  $('gForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('gExtra'), text = input.value.replace(/\s+/g, ' ').trim(), key = M.key(D.amount(text).what);
    if (!text || !key) { input.focus(); return; }
    if (change({ op: 'extra', text, key })) input.value = '';
  });
  grocery.addEventListener('change', e => {
    const c = e.target.closest('input[data-key]');
    if (c) change({ op: 'got', key: c.dataset.key, on: c.checked });
  });
  $('gClear').addEventListener('click', () => {
    const v = shown(), op = v && M.clearing(v.list, recipes, D.amount);
    if (!op || (!op.keys.length && !op.recipes.length)) return;
    change(op);
    grocery.focus({ preventScroll: true });   // Clear itself is gone
  });

  // On the recipe card: Add to grocery list, or On the grocery list
  function drawListBtn(v) {
    const b = $('listBtn');
    if (!b) return;
    b.hidden = !v;
    if (!v) return;
    const on = v.list.recipes.some(x => x.id === viewId);
    b.setAttribute('aria-pressed', on);
    b.innerHTML = on ? `${ICON.tick}<span>On the grocery list</span>` : `${ICON.bag}<span>Add to grocery list</span>`;
  }
  function toggleList() {
    const r = recipes.find(x => x.id === viewId), v = shown();
    if (!r || !v) return;
    change(v.list.recipes.some(x => x.id === r.id) ? { op: 'drop', recipe: r.id } : { op: 'add', recipe: r.id, name: r.name, keys: M.keysOf(r, D.amount) });
  }

  // Settings: share the plan with one other person. Someone asks; the other says yes in their Settings.
  let others = null, othersProblem = '';   // who can be asked, [{ key, name }], loaded when Settings opens
  async function loadOthers() {
    others = null;
    othersProblem = '';
    try { others = (await mealsApi().people()).people; }
    catch (e) { othersProblem = problem(e); if (e.code === 'signin') signOut(); }
    drawMeals();
  }
  const shareRow = (p, note, button) => `<div class="row">${avatar(p)}<span class="who"><b>${D.esc(p.name)}</b><small>${D.esc(note)}</small></span>${button}</div>`;
  function drawShare(v) {
    $('sMeal').hidden = !v;
    if (!v) return;
    const s = v.share || {}, off = sharing ? ' disabled' : '';
    let html = '';
    if (s.invite) {
      const n = D.esc(s.invite.name), also = s.with ? ` You stop sharing with ${D.esc(s.with.name)}, who keeps the plan you share now.` : '';
      html += `<div class="box waiting"><div class="row">${avatar(s.invite)}<span class="who"><b>${n} asked to share</b><small>One meal plan and one grocery list for you both.${also}</small></span></div>`
        + `<div class="two"><button class="pill solid" type="button" data-share="join"${off}>Join</button><button class="pill" type="button" data-share="decline" aria-label="No thanks to ${n}"${off}>No thanks</button></div></div>`;
    }
    let main;
    if (s.with) {
      main = shareRow(s.with, 'Shares your meal plan and grocery list',
        `<button class="pill${leaveArmed ? ' armed' : ''}" type="button" data-share="leave" aria-label="${leaveArmed ? 'Tap again to stop' : 'Stop'} sharing with ${D.esc(s.with.name)}"${off}>${leaveArmed ? 'Tap again' : 'Stop sharing'}</button>`);
    } else if (s.asked) {
      main = shareRow(s.asked, `Waiting for ${s.asked.name} to say yes`, `<button class="pill" type="button" data-share="cancel" aria-label="Take back the ask to ${D.esc(s.asked.name)}"${off}>Cancel</button>`);
    } else {
      const chips = othersProblem ? `<p class="soft">${D.esc(othersProblem)}</p>` : others === null ? '<p class="soft">Loading…</p>'
        : others.length ? `<div class="partners" role="group" aria-label="Ask someone to share">${others.map(p => `<button type="button" data-ask="${D.esc(p.key)}"${off}>${D.esc(p.name)}</button>`).join('')}</div>`
        : '<p class="soft">No one else has an account yet.</p>';
      main = `<p>Share your meal plan and grocery list with one other person. They join when they say yes.</p>${chips}`;
    }
    $('sShare').innerHTML = html + `<div class="box mealbox">${main}</div>`;
  }
  // Stop sharing asks for a second tap.
  let leaveArmed = false, leaveT = 0;
  $('sMeal').addEventListener('click', async e => {
    const b = e.target.closest('[data-share], [data-ask]'), v = shown();
    if (!b || b.disabled || sharing || !v) return;
    const what = b.dataset.share || 'ask', s = v.share || {};
    if (what === 'leave' && !leaveArmed) {
      leaveArmed = true;
      clearTimeout(leaveT);
      leaveT = setTimeout(() => { leaveArmed = false; drawMeals(); }, 4000);
      drawMeals();
      return;
    }
    leaveArmed = false;
    if (meals.queue.length) { said('Your last changes are still on their way. Try again in a moment.'); retryNow(); return; }
    const name = what === 'ask' ? b.textContent : what === 'leave' ? s.with.name : what === 'cancel' ? s.asked.name : s.invite.name;
    sharing = true;
    said('');
    drawMeals();
    try {
      const out = await mealsApi().share(what, b.dataset.ask);
      if (planner()) { meals.state = out; lastPost = ++ticks; saveMeals(); }   // newer than a GET on its way
      said({
        ask: `${name} is asked. They can say yes in their Settings.`, cancel: `The ask to ${name} is taken back.`,
        join: `You share a meal plan and grocery list with ${name} now.`, decline: `You said no to ${name}.`,
        leave: `You stopped sharing with ${name}. Your own plan is back.`
      }[what]);
      if (what !== 'ask' && what !== 'join') loadOthers();
    } catch (err) {
      said(problem(err));
      if (err.code === 'signin') signOut(); else pull();   // asked, taken, gone or nobody: show how things are now
    } finally {
      sharing = false;
      drawMeals();
    }
  });

  applyTheme();
  readMeals();
  account();
  load();
  checkWaiting();
  drawMeals();
  later();   // changes this phone kept from last time
  pull();

  // Offline: sw.js keeps the page's files, so it opens with no signal. A new version takes over in the background
  // while the page still shows the old files, so offer a reload; not on the first install.
  if ('serviceWorker' in navigator) {
    if (navigator.serviceWorker.controller?.scriptURL === new URL('sw.js', location).href)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        toast('Updated · Tap to reload'); clearTimeout(toastT);
        const t = $('toast'); t.classList.add('tap'); t.onclick = () => location.reload();
      }, { once: true });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
