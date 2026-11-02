/* Recipes — the data file and the calls to the API Worker. Plain functions, no DOM.
   recipes/recipes.json is the only copy of the recipes. The page reads it, and saves one change at a time to GitHub
   through the Worker (worker/recipes.js), so edits that Claude makes to the file from chat are kept. The Worker holds
   the GitHub token; the page holds only a dorrance.me sign-in (shared/account.js).
   Browser: window.RecipeData. Node: require('./data.js'). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RecipeData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REPO = 'dorrance5/dorrance.me';
  const API = '/api/recipes/';
  // Field order in the file. Fields the page does not know about go after these and are kept as they are.
  const ORDER = ['id', 'name', 'servings', 'tags', 'ingredients', 'steps', 'notes', 'source', 'owner', 'shared'];

  /* ---- ids ---- */
  // "Megan's zuppa toscana" -> "megans-zuppa-toscana". Accents fold to plain letters: "Crème brûlée" -> "creme-brulee".
  function slug(name) {
    const s = String(name).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
      .replace(/['’‘`]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    return s || 'recipe';
  }
  function uniqueId(name, recipes) {
    const base = slug(name), taken = new Set(recipes.map(r => r && r.id));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  /* ---- the editor's text fields ---- */
  // List marks that come along when a list is pasted: "-", "•", "*", "1." and "1)", and the boxes some recipe sites put
  // before each ingredient. "1.5 lb" keeps its number, because a mark needs a space after it.
  const MARK = /^\s*(?:[-•*·◦▪‣–—▢☐□]\s*|\d{1,3}[.)](?:\s+|$))/;
  const cleanLine = line => line.replace(MARK, '').trim();
  const cleanPaste = text => String(text).split(/\r\n|\r|\n/).map(cleanLine).filter(Boolean).join('\n');
  const lines = text => String(text || '').split(/\r\n|\r|\n/).map(s => s.trim()).filter(Boolean);
  function tagList(text) {
    const seen = new Set();
    return String(text || '').split(',').map(s => s.trim()).filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  }
  // A link without "https://" gets it. Other text, such as a cookbook or a person, stays as it is.
  function normUrl(text) {
    const s = String(text || '').trim();
    if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    return /^[^\s/]+\.[a-z]{2,}(?:[/?#:]\S*)?$/i.test(s) ? 'https://' + s : s;
  }
  // Only http and https links are shown as links.
  function safeUrl(s) {
    try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null; } catch (e) { return null; }
  }

  // The editor's fields to a recipe in file order. Empty optional fields are left out, and so is `shared` when the
  // recipe is shared. `old` is the recipe as it is in the file now: it keeps its owner and the fields this page does not
  // know about. A new recipe gets `owner`.
  function fromForm(f, id, old, owner) {
    const r = { id, name: String(f.name || '').trim() };
    const servings = String(f.servings || '').trim();
    if (servings) r.servings = servings;
    const tags = tagList(f.tags);
    if (tags.length) r.tags = tags;
    r.ingredients = lines(f.ingredients);
    const steps = lines(f.steps);
    if (steps.length) r.steps = steps;
    const notes = String(f.notes || '').replace(/\r\n?/g, '\n').trim();
    if (notes) r.notes = notes;
    const source = normUrl(f.source);
    if (source) r.source = source;
    const who = old ? old.owner : owner;
    if (who) r.owner = who;
    if (f.shared === false) r.shared = false;
    if (old) for (const k of Object.keys(old)) if (!ORDER.includes(k)) r[k] = old[k];
    return r;
  }
  // A recipe to the editor's fields.
  function toForm(r) {
    return {
      name: r.name || '', servings: r.servings || '', tags: (r.tags || []).join(', '),
      ingredients: (r.ingredients || []).join('\n'), steps: (r.steps || []).join('\n'), notes: r.notes || '', source: r.source || '',
      shared: r.shared !== false
    };
  }

  /* ---- whose recipe: everyone has a book ---- */
  // `who` is the person looking, { key, name, partner }, or null when signed out. `key` is the name in lower case;
  // `partner` is the key of the person who shares their meal plan, their household. A recipe's `owner` is a name.
  // A recipe with no owner (one from before owners) belongs to everyone, like the recipes did before.
  const same = (owner, key) => !!owner && !!key && String(owner).toLowerCase() === key;
  // The owner and their household change a recipe; anyone else edits a copy of it.
  const canEdit = (r, who) => !r.owner || (!!who && (same(r.owner, who.key) || same(r.owner, who.partner)));
  const booksOf = data => data.books && typeof data.books === 'object' && !Array.isArray(data.books) ? data.books : {};
  const listOf = (data, key) => key && Array.isArray(booksOf(data)[key]) ? booksOf(data)[key] : [];
  // The recipes added from others to the household's book, as ids.
  const pulledBy = (data, who) => new Set([...listOf(data, who.key), ...listOf(data, who.partner)]);
  // What the box shows: `book`, the person's own recipes, their household's and the shared ones they added; and
  // `others`, the shared recipes of everyone else ("Shared with you"). Signed out, the book is every shared recipe.
  // `recipes` is forView(data).
  function shelves(data, recipes, who) {
    if (!who) return { book: recipes.filter(r => r.shared), others: [] };
    const pulled = pulledBy(data, who);
    const mine = r => canEdit(r, who) || (r.shared && pulled.has(r.id));
    return { book: recipes.filter(mine), others: recipes.filter(r => r.shared && !mine(r)) };
  }
  // "Megan's zuppa toscana" -> "Megan's zuppa toscana (Hayden's version)"
  const versionName = (name, who) => `${name} (${who.name}'s version)`;

  /* ---- the file ---- */
  function parse(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !Array.isArray(data.recipes)) throw new Error('recipes.json has no "recipes" list');
    return data;
  }
  // 2-space indentation and a newline at the end, so that the diffs are easy to read.
  const serialize = data => JSON.stringify(data, null, 2) + '\n';

  // The recipes for the page: every one with a name and a list of ingredients, sorted by name.
  function forView(data) {
    const strs = a => Array.isArray(a) ? a.filter(x => x != null && x !== '').map(String) : [];
    return data.recipes.filter(r => r && typeof r === 'object' && r.id && r.name).map(r => ({
      ...r, id: String(r.id), name: String(r.name), tags: strs(r.tags), ingredients: strs(r.ingredients), steps: strs(r.steps),
      servings: r.servings == null ? '' : String(r.servings), notes: r.notes == null ? '' : String(r.notes), source: r.source ? String(r.source) : '',
      owner: r.owner ? String(r.owner) : '', shared: r.shared !== false
    })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  }

  // The books with `ids` taken out of the household's lists; a list that is left empty goes, and so do the books.
  function without(data, ids, keys) {
    const books = { ...booksOf(data) };
    let changed = false;
    for (const k of Object.keys(books)) {
      if (keys && !keys.includes(k)) continue;
      const kept = Array.isArray(books[k]) ? books[k].filter(id => !ids.includes(id)) : [];
      if (kept.length === (books[k] || []).length) continue;
      changed = true;
      if (kept.length) books[k] = kept; else delete books[k];
    }
    if (!changed) return data;
    const out = { ...data, books };
    if (!Object.keys(books).length) delete out.books;
    return out;
  }
  // Applies one change to the data that was just read from GitHub. Returns { data, recipe, message };
  // message is null when there is nothing to commit (the recipe to delete is gone already). `who` is the person
  // signed in (see shelves()).
  //   { type: 'add', form } | { type: 'edit', id, form } | { type: 'delete', id }
  //   { type: 'copy', id, form }: a copy of someone else's recipe, in the place of theirs in the book
  //   { type: 'pull', id }: someone else's shared recipe into the book    { type: 'unpull', id }: out of the book
  //   { type: 'import', forms, shared }: the recipes of an import file (parseImport), each as a new recipe
  //   { type: 'category', name, to, color }: rename the category `name` to `to` on every recipe (into another category
  //     if one has that name), and give it a color from COLORS     { type: 'uncategory', name }: off every recipe
  function apply(data, change, who) {
    const list = data.recipes.slice();
    const at = list.findIndex(r => r && r.id === change.id), old = list[at];
    const house = who ? [who.key, who.partner].filter(Boolean) : [];
    if (change.type === 'add') {
      const recipe = fromForm(change.form, uniqueId(change.form.name, list), null, who && who.name);
      list.push(recipe);
      return { data: { ...data, recipes: list }, recipe, message: `Recipes: add ${recipe.name}` };
    }
    if (change.type === 'copy') {
      if (at < 0) throw fail('gone');
      const recipe = fromForm(change.form, uniqueId(change.form.name, list), null, who && who.name);
      list.push(recipe);
      return { data: without({ ...data, recipes: list }, [old.id], house), recipe, message: `Recipes: copy ${old.name} as ${recipe.name}` };
    }
    if (change.type === 'edit') {
      if (at < 0) throw fail('gone');
      if (!canEdit(old, who)) throw fail('notyours');
      const recipe = fromForm(change.form, change.id, old);
      list[at] = recipe;
      return { data: { ...data, recipes: list }, recipe, message: `Recipes: edit ${recipe.name}` };
    }
    if (change.type === 'delete') {
      if (at < 0) return { data, recipe: null, message: null };
      if (!canEdit(old, who)) throw fail('notyours');
      list.splice(at, 1);
      return { data: without({ ...data, recipes: list }, [old.id]), recipe: old, message: `Recipes: delete ${old.name}` };
    }
    if (change.type === 'pull') {
      if (at < 0 || old.shared === false || !who) throw fail('gone');
      if (canEdit(old, who) || pulledBy(data, who).has(old.id)) return { data, recipe: old, message: null };
      const books = { ...booksOf(data), [who.key]: [...listOf(data, who.key), old.id] };
      return { data: { ...data, books }, recipe: old, message: `Recipes: add ${old.name} to a book` };
    }
    if (change.type === 'unpull') {
      const out = who ? without(data, [change.id], house) : data;
      const name = old ? old.name : change.id;
      return { data: out, recipe: old || null, message: out === data ? null : `Recipes: take ${name} out of a book` };
    }
    if (change.type === 'import') {   // many recipes at once, from an import file (parseImport), all owned by `who`
      const added = change.forms.map(form => {
        const recipe = fromForm({ ...form, shared: change.shared }, uniqueId(form.name, list), null, who && who.name);
        list.push(recipe);
        return recipe;
      });
      if (!added.length) return { data, recipe: null, recipes: [], message: null };
      const what = added.length === 1 ? added[0].name : `${added.length} recipes`;
      return { data: { ...data, recipes: list }, recipe: added[0], recipes: added, message: `Recipes: import ${what}`.slice(0, 150) };
    }
    if (change.type === 'category' || change.type === 'uncategory') return recategory(data, change);
    throw new Error('unknown change ' + change.type);
  }

  /* ---- categories: the admin renames, colors and deletes them. Picked colors are in `colors`, by the category in
     lower case: "colors": { "grill": "rust" }. ---- */
  const COLORS = ['tomato', 'carrot', 'butter', 'rust'];
  const low = s => String(s).toLowerCase();
  function recategory(data, change) {
    const name = String(change.name), k = low(name), drop = change.type === 'uncategory';
    const to = drop ? '' : String(change.to || '').replace(/,/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 40) || name;
    let used = 0;
    const recipes = data.recipes.map(r => {
      if (!r || !Array.isArray(r.tags) || !r.tags.some(t => low(t) === k)) return r;
      used++;
      const tags = [];
      for (const t of r.tags) { const v = low(t) === k ? to : String(t); if (v && !tags.some(x => low(x) === low(v))) tags.push(v); }
      const out = { ...r, tags };
      if (!tags.length) delete out.tags;
      return out;
    });
    const colors = { ...(data.colors && typeof data.colors === 'object' ? data.colors : {}) }, had = colors[k];
    delete colors[k];
    const color = drop ? null : COLORS.includes(change.color) ? change.color : colors[low(to)] || had;
    if (color) colors[low(to)] = color;
    const out = { ...data, recipes };
    if (Object.keys(colors).length) out.colors = colors; else delete out.colors;
    const renamed = to !== name, recolored = !drop && !!change.color && color !== had;
    if (drop ? !used && !had : !renamed && !recolored) return { data, recipe: null, message: null };
    const message = drop ? `Recipes: delete category ${name}`
      : `Recipes: ${renamed ? `rename category ${name} to ${to}` : `color category ${name}`}${recolored ? ` ${color}` : ''}`;
    return { data: out, recipe: null, recipes: [], message: message.slice(0, 150) };
  }

  /* ---- import files ---- */
  // An AI assistant makes these from photos, links or notes, following recipes/import.txt:
  // { "dorranceRecipes": 1, "recipes": [{ name, servings, tags, ingredients, steps, notes, source }] }. The reader is
  // forgiving, since assistants vary: a bare list, one recipe, schema.org Recipe data (recipeIngredient,
  // recipeInstructions, recipeYield, recipeCategory, @graph), "title", "directions" and the like, a chat's ```json code
  // blocks (several are joined), or a list as one text with a line each. Returns { forms, skipped }: the recipes as the
  // editor's fields (toForm), and the numbers of the entries that had no name.
  const MAX_IMPORT = 500;
  const clip = (v, n) => String(v).replace(/\s+/g, ' ').trim().slice(0, n);
  function textOf(v) {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
    if (Array.isArray(v)) return textOf(v[0]);
    if (typeof v === 'object') return textOf(v.text || v.name || v.url || v['@id'] || '');
    return '';
  }
  // Ingredients or steps: strings, lines in one string, HowToStep and HowToSection objects, or groups of items.
  function itemsOf(v, out = []) {
    if (v == null) return out;
    if (typeof v === 'string' || typeof v === 'number') { for (const l of String(v).split(/\r\n|\r|\n/)) { const c = clip(cleanLine(l), 1000); if (c) out.push(c); } return out; }
    if (Array.isArray(v)) { for (const x of v) itemsOf(x, out); return out; }
    if (typeof v === 'object') {
      const kids = v.itemListElement || v.items || v.ingredients || v.steps || v.list;
      if (kids) return itemsOf(kids, out);
      return itemsOf(v.text || v.name || '', out);
    }
    return out;
  }
  const pick = (r, keys) => { for (const k of keys) if (r[k] != null && r[k] !== '') return r[k]; return undefined; };
  function tagsOf(v) {
    const list = Array.isArray(v) ? v.map(textOf) : typeof v === 'string' ? v.split(',') : [];
    return tagList(list.map(t => clip(t, 30)).join(','));
  }
  // One entry of the file as the editor's fields, or null without a name.
  function importForm(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const name = clip(textOf(pick(r, ['name', 'title', 'headline'])), 200);
    if (!name) return null;
    const lim = a => a.slice(0, 300).join('\n');
    return {
      name, servings: clip(textOf(pick(r, ['servings', 'serves', 'yield', 'recipeYield', 'makes'])), 60),
      tags: tagsOf(pick(r, ['tags', 'categories', 'category', 'recipeCategory']) || []).join(', '),
      ingredients: lim(itemsOf(pick(r, ['ingredients', 'recipeIngredient', 'ingredient']))),
      steps: lim(itemsOf(pick(r, ['steps', 'recipeInstructions', 'instructions', 'directions', 'method']))),
      notes: String(textOf(pick(r, ['notes', 'note', 'tips'])) || '').slice(0, 4000),
      source: clip(textOf(pick(r, ['source', 'url', 'sourceUrl', 'link'])), 500),
      shared: true
    };
  }
  const isRecipe = x => x && typeof x === 'object' && [].concat(x['@type'] || []).some(t => String(t).toLowerCase() === 'recipe');
  function entriesOf(raw) {
    if (Array.isArray(raw)) return raw.flatMap(x => Array.isArray(x) || (x && (x.recipes || x['@graph'])) ? entriesOf(x) : [x]);
    if (!raw || typeof raw !== 'object') return [];
    if (Array.isArray(raw.recipes)) return raw.recipes;
    if (Array.isArray(raw['@graph'])) return raw['@graph'].filter(isRecipe);
    return [raw];
  }
  function readJson(text) {
    try { return JSON.parse(text); } catch (e) {}
    const a = text.search(/[[{]/), b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (a < 0 || b < a) throw fail('importjson');
    try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { throw fail('importjson'); }
  }
  function parseImport(text) {
    const s = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!s) throw fail('importjson');
    const blocks = [...s.matchAll(/```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/g)].map(m => m[1].trim()).filter(Boolean);
    const entries = (blocks.length ? blocks : [s]).flatMap(b => entriesOf(readJson(b)));
    const forms = [], skipped = [];
    entries.forEach((r, i) => { const f = importForm(r); if (f) forms.push(f); else skipped.push(i + 1); });
    if (!forms.length) throw fail('importnone');
    if (forms.length > MAX_IMPORT) throw fail('importmany');
    return { forms, skipped };
  }

  /* ---- search ---- */
  const reFor = (term, flags) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Escaped HTML with each match of `term` in a <mark>.
  function hl(text, term) {
    text = String(text);
    if (!term) return esc(text);
    const re = reFor(term, 'gi');
    let out = '', last = 0, m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }
  // null when the recipe does not match. Otherwise the ingredients that match, and a short piece of the step or
  // note that matches when nothing else does.
  function match(r, term) {
    const re = reFor(term, 'i');
    const ingredients = r.ingredients.filter(i => re.test(i));
    if (ingredients.length || re.test(r.name) || r.tags.some(t => re.test(t))) return { ingredients, snippet: null };
    const hit = [...r.steps, r.notes].find(s => s && re.test(s));
    if (!hit) return null;
    const at = hit.search(re), from = Math.max(0, hit.lastIndexOf(' ', Math.max(0, at - 24)) + 1);
    const end = Math.min(hit.length, at + term.length + 40);
    return { ingredients, snippet: (from > 0 ? '…' : '') + hit.slice(from, end) + (end < hit.length ? '…' : '') };
  }

  /* ---- amounts and times, for the recipe card and cooking mode ---- */
  // "1/4 tsp Italian seasoning" -> { qty: '¼ tsp', what: 'Italian seasoning' }. A line with no amount has qty ''.
  const FRAC = '[¼½¾⅓⅔⅛⅜⅝⅞]';
  const NUM = `(?:\\d+(?:[.,]\\d+)?(?:\\s+\\d\\/\\d|\\s*${FRAC})?|\\d\\/\\d|${FRAC})`;
  const UNITS = 'cups?|tablespoons?|tbsps?|tbs|teaspoons?|tsps?|pounds?|lbs?|ounces?|oz|grams?|g|kilograms?|kg|ml|milliliters?|liters?|l|' +
    'quarts?|qts?|pints?|pts?|gallons?|gal|cloves?|strips?|slices?|packets?|packages?|pkgs?|jars?|cans?|sticks?|bunch(?:es)?|heads?|' +
    'pinch(?:es)?|dash(?:es)?|sprigs?|stalks?|handfuls?|dozen|pieces?|inch(?:es)?|boxes|box|bags?|bottles?|envelopes?|containers?|links?';
  const SIZE = '(?:small|medium|large|big|heaping|level|scant)';
  const AMOUNT = new RegExp(`^(${NUM}(?:\\s*(?:-|–|to|or)\\s*${NUM})?(?:\\s+${SIZE})?(?:\\s*(?:${UNITS})\\b\\.?)?)\\s+(\\S.*)$`, 'i');
  const GLYPH = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞' };
  const pretty = q => q.replace(/(\d+)\s+(\d\/\d)\b/g, (m, w, f) => GLYPH[f] ? w + GLYPH[f] : m).replace(/\b\d\/\d\b/g, f => GLYPH[f] || f);
  function amount(line) {
    const s = String(line).trim(), m = AMOUNT.exec(s);
    return m ? { qty: pretty(m[1]), what: m[2] } : { qty: '', what: s };
  }
  // The first time in a step, as a timer: { secs, note }, or null. "Simmer 10 to 15 minutes" -> 600 s, "10–15 min in
  // this step". A range starts at the shorter time; "1 hour 30 minutes" is one timer.
  const TIME = /(\d+)(?:\s*(?:to|-|–|or)\s*(\d+))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b(?:,?\s*(?:and\s+)?(\d+)\s*(?:minutes?|mins?)\b)?/i;
  function timerFor(step) {
    const m = TIME.exec(String(step));
    if (!m) return null;
    const u = m[3][0].toLowerCase(), per = { h: 3600, m: 60, s: 1 }[u], more = u === 'h' && m[4] ? +m[4] : 0;
    const secs = +m[1] * per + more * 60;
    if (!secs) return null;
    return { secs, note: `${m[1]}${m[2] ? '–' + m[2] : ''} ${{ h: 'hr', m: 'min', s: 'sec' }[u]}${more ? ` ${more} min` : ''} in this step` };
  }
  // 300 -> "5:00", 5400 -> "1:30:00"
  function clock(secs) {
    const s = Math.max(0, Math.round(secs)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), pad = n => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
  }

  /* ---- base64 that keeps non-ASCII text (plain atob and btoa work on bytes, not on UTF-8 text) ---- */
  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromBase64(b64) {
    const bin = atob(String(b64).replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---- errors ---- */
  // The words for each error code of a save. The Worker answers with { error: CODE }; shared/account.js has the
  // words for the account codes.
  const PROBLEMS = {
    network: 'No connection.',
    signin: 'You are signed out. Sign in again.',
    setup: 'Saving is not set up yet. The admin needs to finish the setup.',
    github: 'The recipe book cannot reach GitHub. The admin needs to check its GitHub token.',
    changed: 'recipes.json kept changing on GitHub during the save.',
    rate: 'GitHub’s hourly limit is used up. Try again later.',
    json: 'recipes.json on GitHub is not valid JSON. Fix it in GitHub first.',
    file: 'The change would break recipes.json, so it is not saved.',
    gone: 'This recipe is no longer in recipes.json. Someone deleted it after this page loaded.',
    notyours: 'This recipe is someone else’s now. Edit makes your own copy of it.',
    importjson: 'Recipes can’t read this. Ask your AI to follow dorrance.me/recipes/import.txt and make the file again.',
    importnone: 'There are no recipes in this. Each recipe needs a name.',
    importmany: `That is more than ${MAX_IMPORT} recipes. Split them into more than one file.`
  };
  // An Error with a plain message. `code` is one of the words above, or a status number.
  function fail(code) {
    const e = new Error(PROBLEMS[code] || `The server answered with error ${code}.`);
    e.code = code;
    return e;
  }
  async function failFrom(res) {
    let code = res.status;
    try { const b = await res.json(); if (b && PROBLEMS[b.error]) code = b.error; } catch (e) {}
    return fail(code);
  }

  /* ---- the API Worker ---- */
  // `token` is the dorrance.me sign-in; it goes only in the Authorization header. `fetchFn` is for tests.
  function api(token, fetchFn) {
    const f = fetchFn || ((url, opts) => fetch(url, opts));
    async function call(path, method = 'GET', body) {
      const headers = {};
      if (token) headers.Authorization = 'Bearer ' + token;
      if (body) headers['Content-Type'] = 'application/json';
      try { return await f(API + path, { method, headers, cache: 'no-store', body: body ? JSON.stringify(body) : undefined }); }
      catch (e) { throw fail('network'); }
    }
    async function send(path, method, body) {
      const res = await call(path, method, body);
      if (!res.ok) throw await failFrom(res);
      return res.json();
    }

    // The file on main and its sha.
    async function read() {
      const body = await send('file');
      let data;
      try { data = parse(fromBase64(body.content)); } catch (e) { throw fail('json'); }
      return { data, sha: body.sha };
    }
    // Reads the file, applies the one change as `who`, and writes it back. A 409 means the file changed in between
    // (Claude saved from chat, or another phone): read and apply once more.
    async function save(change, who) {
      for (let attempt = 1; ; attempt++) {
        const { data, sha } = await read();
        const out = apply(data, change, who);
        if (!out.message) return out;
        const res = await call('file', 'PUT', { message: out.message, content: toBase64(serialize(out.data)), sha });
        if (res.status === 409 && attempt < 2) continue;
        if (!res.ok) throw await failFrom(res);
        return out;
      }
    }
    return { read, save };
  }

  return { COLORS, REPO, API, slug, uniqueId, cleanLine, cleanPaste, lines, tagList, normUrl, safeUrl, fromForm, toForm, parse, serialize,
    forView, canEdit, shelves, versionName, apply, parseImport, MAX_IMPORT, hl, esc, match, amount, timerFor, clock, toBase64, fromBase64, fail, api };
});
