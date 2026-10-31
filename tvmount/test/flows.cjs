// Drives the app in WebKit at iPhone size: keypad entry, modes, tabs, pan and zoom,
// backup restore, offline reload and an app update. Exits 1 on a failed check or console error.
//   NODE_PATH=/path/to/node_modules node tvmount/test/flows.cjs
const { webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
let swBump = null;   // when set, sw.js is served with this cache name, like a deploy would
// A stand-in for the Cloudflare Worker that holds the shared library; passcode "abc". It is in the server,
// not a Playwright route, because routes miss the requests of a page the service worker controls.
const shared = { tvs: [{ id: 'l1', model: 'SHARED65', w: 57, h: 32.5, vesaTop: 7, vesaW: 15.75, vesaH: 11.75 }], mounts: [] };
function api(req, res, p, body) {
  const m = p.match(/lib(?:\/(tv|mount)(?:\/(.+))?)?$/);
  const reply = (b, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(b)); };
  if (req.method === 'GET') return reply(shared);
  if (req.headers['x-passcode'] !== 'abc') return reply({ error: 'passcode' }, 403);
  const list = shared[m[1] === 'tv' ? 'tvs' : 'mounts'];
  if (req.method === 'PUT') { const it = JSON.parse(body); const i = list.findIndex(x => x.model.toLowerCase() === it.model.toLowerCase()); if (i >= 0) list[i] = { ...it, id: list[i].id }; else list.push({ ...it, id: 's' + list.length }); }
  if (req.method === 'DELETE') { const i = list.findIndex(x => x.id === m[2]); if (i >= 0) list.splice(i, 1); }
  return reply({ lib: shared });
}
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith('/api/tvmount/lib')) { let b = ''; req.on('data', c => b += c); req.on('end', () => api(req, res, p, b)); return; }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
  if (swBump && p.endsWith('/tvmount/sw.js')) body = Buffer.from(body.toString().replace(/const CACHE = '[^']+'/, `const CACHE = '${swBump}'`));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !ok ? ' — ' + JSON.stringify(info) : ''}`); };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/tvmount/`;
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  let offline = false;   // with the network off, the library sync fails on purpose and WebKit logs it
  page.on('console', m => { if (m.type() === 'error' && !(offline && m.location().url.includes('/api/'))) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  const tab0 = () => page.evaluate(() => TVM.doc.tabs.find(t => t.id === TVM.doc.current));
  const keys = async (...ks) => { for (const k of ks) await page.tap(`#kp [data-key="${k}"]`); };
  const hero = () => page.textContent('#res .hero .v');

  await page.goto(base);
  await page.waitForSelector('#form [data-seg="tv.src"]');

  // new tabs start on a standard size and half a distance
  check('standard size and half a distance by default', !!(await page.$('[data-size="65"]')) && !!(await page.$('[data-k="center.d"]')));
  const firsts = await page.$$eval('#form .seg', segs => segs.map(sg => sg.firstElementChild.classList.contains('on')));
  check('every choice starts on its leftmost option', firsts.every(Boolean), firsts);
  check('half a distance has no left or right choice', !(await page.$('[data-seg="center.from"]')));
  await page.tap('[data-seg="tv.src"] [data-v="measured"]');

  // keypad: whole inches, then numerator over denominator like Calculator
  await page.tap('[data-k="tv.w"]');
  check('keypad opens on a field', await page.isVisible('#kp'));
  await keys('5', '7', 'n1');
  check('a numerator alone waits for its denominator', (await tab0()).tv.w === 57, (await tab0()).tv.w);
  await keys('d8');
  check('57 + 1/8 stores 57.125', (await tab0()).tv.w === 57.125, (await tab0()).tv.w);
  check('field shows 57 1/8"', (await page.textContent('[data-k="tv.w"] .fv')).replace(/\u00a0/g, ' ') === '57 1/8"');
  await keys('next', '3', '2', 'n3', 'd4');
  check('next moves to height, 32 3/4', (await tab0()).tv.h === 32.75);
  // reopen a filled field: a numerator key keeps the whole inches, a denominator key keeps the numerator
  await page.tap('[data-k="tv.h"]');
  await keys('n5', 'd8');
  check('numerator key on a filled field keeps the whole inches', (await tab0()).tv.h === 32.625);
  await page.tap('[data-k="tv.h"]');
  await keys('d1');
  check('5/1 waits for the next digit', (await tab0()).tv.h === 32.625, (await tab0()).tv.h);
  await keys('d6');
  check('denominator key on a filled field keeps the numerator', (await tab0()).tv.h === 32.3125, (await tab0()).tv.h);
  await page.tap('[data-k="tv.h"]');
  await keys('n3', 'd4');
  await page.tap('[data-k="mount.holesToTop"]');
  await keys('4', 'n1', 'n3', 'd3', 'd2');
  check('13/32 typed digit by digit makes 4 13/32', (await tab0()).mount.holesToTop === 4.40625, (await tab0()).mount.holesToTop);
  check('display stacks the fraction', await page.$eval('#kpVal', el => el.querySelector('.fr .nu').textContent === '13' && el.querySelector('.fr .de').textContent === '32'));
  await keys('sign');
  check('± makes it negative', (await tab0()).mount.holesToTop === -4.40625);
  await keys('back', 'back', 'back', 'back');
  check('delete takes digits off right to left', (await tab0()).mount.holesToTop === -4, (await tab0()).mount.holesToTop);
  await keys('clear');
  check('clear blanks the field', (await tab0()).mount.holesToTop === null);
  await keys('4', '.', '5');
  check('decimal entry 4.5', (await tab0()).mount.holesToTop === 4.5);
  await page.tap('[data-k="center.d"]');
  await keys('1', 'n3', 'd2');
  check('3/2 waits while typing', (await tab0()).center.d === 1, (await tab0()).center.d);
  await keys('done');
  check('3/2 is saved on Done as 2 1/2', (await tab0()).center.d === 2.5, (await tab0()).center.d);
  await page.tap('[data-k="center.d"]');
  await page.keyboard.type('30 1/4');
  check('typing 30 1/4 on a keyboard', (await tab0()).center.d === 30.25, (await tab0()).center.d);
  await page.keyboard.press('Delete');
  await page.keyboard.type('3/8');
  check('typing 3/8 on a keyboard', (await tab0()).center.d === 0.375, (await tab0()).center.d);
  await keys('clear');
  const edges = await page.$$eval('[data-seg="ref.floor.edge"] button', bs => bs.map(x => x.dataset.v + (x.classList.contains('on') ? '*' : '')));
  check('Set the starts on TV bottom, leftmost', edges.join() === 'bottom*,center,top', edges);
  await page.tap('[data-seg="ref.floor.edge"] [data-v="center"]');
  await page.tap('[data-k="ref.floor.value"]');
  await keys('4', '2', 'done');
  check('keypad closes on Done', !(await page.isVisible('#kp')));
  check('hero shows 53 7/8" for center at 42', (await hero()).replace(/\u00a0/g, ' ') === '53 7/8"', await hero());

  // the bracket measured down to the TV bottom lands the holes in the same place
  await page.tap('[data-seg="mount.holesFrom"] [data-v="bottom"]');
  await page.tap('[data-k="mount.holesToBottom"]');
  await keys('2', '8', 'n1', 'd4', 'done');
  check('top holes 28 1/4 to TV bottom also gives 53 7/8"', (await hero()).replace(/\u00a0/g, ' ') === '53 7/8"', await hero());
  await page.tap('[data-seg="mount.holesFrom"] [data-v="top"]');
  check('back to TV top keeps both numbers', (await tab0()).mount.holesToTop === 4.5 && (await tab0()).mount.holesToBottom === 28.25);

  // soundbar: off by default, on the wall with a bracket, then on a TV attachment
  check('soundbar starts off', (await tab0()).bar.kind === 'none' && !(await page.$('[data-k="bar.h"]')));
  await page.tap('[data-seg="bar.kind"] [data-v="wall"]');
  await page.tap('[data-k="bar.w"]');
  await keys('4', '5', 'next', '3', 'n1', 'd4', 'next', 'next', '1', 'n1', 'd2', 'done');
  let bar = (await tab0()).bar;
  check('soundbar fields fill in order', bar.w === 45 && bar.h === 3.25 && bar.gap === null && bar.holesToTop === 1.5, bar);
  const barHero = await page.textContent('#res .hero.sb');
  check('soundbar drill height has its own card', /Drill soundbar holes\s*22 1\/8"/.test(barHero.replace(/\u00a0/g, ' ')), barHero);
  check('soundbar is drawn', await page.$('#sk rect.sbar') !== null);
  check('placement offers Soundbar bottom in place of TV bottom', (await page.textContent('[data-seg="ref.floor.edge"] [data-v="bottom"]')) === 'Soundbar bottom');
  check('the Soundbar bottom button fits its text', await page.$eval('[data-seg="ref.floor.edge"] [data-v="bottom"]', el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight));
  check('TV size is not repeated under the results', !/^TV$/m.test(await page.$$eval('#res .li .k', ks => ks.map(k => k.textContent).join('\n'))));
  await page.tap('[data-seg="bar.place"] [data-v="center"]');
  check('centered hides the gap and asks for a console', !(await page.$('[data-k="bar.gap"]')) && !!(await page.$('[data-k="bar.below"]')));
  await page.tap('[data-seg="bar.kind"] [data-v="tv"]');
  check('TV attachment has no bracket holes', !(await page.$('[data-k="bar.holesToTop"]')) && (await page.$$('#sk line.drill')).length === 1 && !/Drill soundbar/.test(await page.textContent('#res')));
  check('TV attachment has no gap field and no note', !(await page.$('[data-k="bar.gap"]')) && !(await page.$('[data-sec="bar"] .hint')));
  const flush = await page.evaluate(() => { const tv = document.querySelector('#sk rect.tv'), sb = document.querySelector('#sk rect.sbar'); return +sb.getAttribute('y') - (+tv.getAttribute('y') + +tv.getAttribute('height')); });
  check('the attached soundbar sits flush under the TV', Math.abs(flush) < 1e-3, flush);
  await page.tap('[data-seg="bar.kind"] [data-v="none"]');
  check('none hides the soundbar again', !(await page.$('#sk rect.sbar')) && (await tab0()).bar.w === 45);
  check('and TV bottom comes back', (await page.textContent('[data-seg="ref.floor.edge"] [data-v="bottom"]')) === 'TV bottom');

  // room: folded at first, sketch only, drawn in screenshot mode
  check('Room card starts folded', await page.$eval('[data-sec="room"]', el => el.classList.contains('shut')));
  await page.tap('[data-fold="room"]');
  await page.tap('[data-k="room.ceil"]');
  await keys('9', '6', 'next', 'next', '6', '0', 'next', '4', '0', 'done');
  const room = (await tab0()).room;
  check('room fields fill in order', room.ceil === 96 && room.mantle === null && room.left === 60 && room.right === 40, room);
  check('the phone sketch leaves the room out', !(await page.$('#sk line.wall')) && (await hero()).replace(/\u00a0/g, ' ') === '53 7/8"');
  await page.tap('[data-shot]');
  check('screenshot mode draws both walls and the ceiling', (await page.$$('#shotSk line.wall')).length === 2 && /Ceiling/.test(await page.textContent('#shotSk')));
  // the client view comes first: where the TV goes, without holes, studs or layout marks
  const shotCap = async () => (await page.textContent('#shotCap')).replace(/\u00a0/g, ' ');
  check('screenshot mode starts on the client view, on the left', await page.$eval('#shotVw', el => el.firstElementChild.dataset.v === 'client' && el.firstElementChild.classList.contains('on')));
  const clientShot = { drill: (await page.$$('#shotSk line.drill')).length, holes: (await page.$$('#shotSk circle.hole')).length, cap: await shotCap(), key: await page.textContent('#shotKey') };
  check('the client view has no drill lines or holes', clientShot.drill === 0 && clientShot.holes === 0, clientShot);
  check('the client caption gives the TV height, not the drill height', /^Living room\s*TV center 42" above floor/.test(clientShot.cap) && !/Drill|holes/.test(clientShot.cap), clientShot.cap);
  await page.tap('#shotVw [data-v="crew"]');
  const crewShot = { drill: (await page.$$('#shotSk line.drill')).length, cap: await shotCap() };
  check('the installer view shows the drill line and height', crewShot.drill === 1 && /Drill top holes 53 7\/8"/.test(crewShot.cap), crewShot);
  check('the view choice is saved', await page.evaluate(() => TVM.doc.settings.shot) === 'crew');
  check('the installer view has a color key', /Drill holes/.test(await page.textContent('#shotKey')));
  check('the client view has no color key', clientShot.key === '');
  await page.tap('#shotX');
  await page.tap('[data-shot]');
  check('and it opens on the last view', await page.$eval('#shotVw .on', el => el.dataset.v) === 'crew' && (await page.$$('#shotSk line.drill')).length === 1);
  await page.tap('#shotVw [data-v="client"]');
  await page.tap('#shotX');
  await page.tap('[data-fold="room"]');

  // modes keep their data
  await page.tap('#menuBtn');
  await page.tap('.sheet [data-set="mode"] [data-v="pro"]');
  await page.tap('.backdrop', { position: { x: 20, y: 20 } });
  await page.tap('[data-k="mount.sag"]');
  await keys('n1', 'd4', 'done');
  check('pro sag 1/4 raises the holes to 54 1/8"', (await hero()).replace(/ /g, ' ') === '54 1/8"', await hero());
  await page.tap('#menuBtn');
  await page.tap('.sheet [data-set="mode"] [data-v="simple"]');
  await page.tap('.backdrop', { position: { x: 20, y: 20 } });
  check('simple ignores sag: back to 53 7/8"', (await hero()).replace(/ /g, ' ') === '53 7/8"');
  check('sag is still saved after switching', (await tab0()).mount.sag === 0.25);

  // theme: no Aurora here, and a shared Aurora setting shows as Night
  await page.tap('#menuBtn');
  const themes = await page.$$eval('.sheet [data-theme]', b => b.map(x => x.dataset.theme));
  check('theme choices are Auto, Day, Night', themes.join() === 'auto,light,dark', themes);
  await page.tap('.backdrop', { position: { x: 20, y: 20 } });
  await page.evaluate(() => { localStorage.setItem('theme', 'aurora'); App.applyTheme(); });
  check('a shared Aurora setting shows Night', await page.evaluate(() => document.documentElement.dataset.mode === 'dark' && !document.querySelector('.field')));
  await page.evaluate(() => { localStorage.removeItem('theme'); App.applyTheme(); });

  // copy as text
  const text = await page.evaluate(() => TVM.text());
  check('copy text has the drill height', text.includes('Drill top holes: 53 7/8" above floor'), text.split('\n').slice(0, 5));
  check('copy text lists inputs', text.includes('Width: 57 1/8"'));

  // tabs
  await page.tap('#tabs .add');
  await page.fill('#tabName', 'Garage');
  await page.tap('.backdrop', { position: { x: 20, y: 20 } });
  let names = await page.$$eval('#tabs [data-tab]:not(.add)', b => b.map(x => x.textContent));
  check('new tab added and renamed', names.includes('Garage'), names);
  check('new tab is empty', (await tab0()).tv.w === null);
  await page.tap('#tabs [data-tab]:first-child');
  check('switching back keeps the first tab', (await tab0()).tv.w === 57.125);

  // persists across reload
  await page.reload();
  await page.waitForSelector('#res .hero');
  check('data survives a reload', (await tab0()).tv.w === 57.125 && (await page.$$('#tabs [data-tab]:not(.add)')).length === 2);

  // delete the Garage tab (two taps)
  await page.tap('#tabs [data-tab]:nth-child(2)');
  await page.tap('#tabs [data-tab]:nth-child(2)');
  await page.tap('.sheet [data-act="del"]');
  await page.tap('.sheet [data-act="del"]');
  names = await page.$$eval('#tabs [data-tab]:not(.add)', b => b.map(x => x.textContent));
  check('tab deleted', !names.includes('Garage'), names);

  // clear a duplicate of the first tab (two taps), keeps its name
  await page.tap('#tabs [data-tab]:first-child');
  if (!await page.$('.sheet [data-act="dup"]')) await page.tap('#tabs [data-tab]:first-child');
  await page.tap('.sheet [data-act="dup"]');
  const nmD = (await tab0()).name;
  await page.tap('#tabs .on'); await page.tap('.sheet [data-act="clear"]');
  check('one tap does not clear', (await tab0()).tv.w === 57.125);
  await page.tap('.sheet [data-act="clear"]');
  check('tab cleared', (await tab0()).tv.w === null && (await tab0()).name === nmD);
  await page.tap('#tabs .on'); await page.tap('.sheet [data-act="del"]'); await page.tap('.sheet [data-act="del"]');
  await page.tap('#tabs [data-tab]:first-child');
  if (await page.$('.sheet')) await page.keyboard.press('Escape');

  // pan, zoom, double-tap reset
  const vb = () => page.getAttribute('#sk', 'viewBox');
  const v0 = await vb();
  const box = await page.locator('#sk').boundingBox();
  await page.mouse.move(box.x + 150, box.y + 150);
  await page.mouse.down(); await page.mouse.move(box.x + 210, box.y + 190, { steps: 4 }); await page.mouse.up();
  const v1 = await vb();
  check('drag pans the sketch', v1 !== v0 && v1.split(' ')[2] === v0.split(' ')[2], [v0, v1]);
  // two fingers spreading apart (mobile WebKit has no mouse wheel)
  await page.$eval('#sk', el => {
    const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const fire = (type, id, dx) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 11, clientX: cx + dx, clientY: cy, bubbles: true }));
    fire('pointerdown', 11, -30); fire('pointerdown', 12, 30);
    for (let i = 1; i <= 6; i++) { fire('pointermove', 11, -30 - i * 10); fire('pointermove', 12, 30 + i * 10); }
    fire('pointerup', 11, -90); fire('pointerup', 12, 90);
  });
  const v2 = await vb();
  check('pinch zooms the sketch', +v2.split(' ')[2] < +v1.split(' ')[2] * 0.6, [v1, v2]);
  await page.tap('#sk', { position: { x: 100, y: 100 } });
  await page.waitForTimeout(80);
  await page.tap('#sk', { position: { x: 100, y: 100 } });
  await page.waitForTimeout(100);
  check('double-tap fits it again', (await vb()) === v0, [v0, await vb()]);
  const halos = await page.$$eval('#sk text.dl', ts => {
    const want = getComputedStyle(document.documentElement).getPropertyValue('--halo').trim();
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'text'); probe.style.stroke = want; document.getElementById('sk').appendChild(probe);
    const ok = getComputedStyle(probe).stroke; probe.remove();
    return ts.filter(t => getComputedStyle(t).stroke !== ok).map(t => t.textContent);
  });
  check('every dimension label has the background halo', halos.length === 0, halos);
  const vbNow = (await vb()).split(' ').map(Number);
  const labelsIn = await page.$$eval('#sk text', (ts, v) => ts.every(t => { const b = t.getBBox(); return b.y >= v[1] - 0.01 && b.y + b.height <= v[1] + v[3] + 0.01; }), vbNow);
  check('no label is cut off at the top or bottom', labelsIn);
  const touchAction = await page.$eval('#sk', el => getComputedStyle(el).touchAction);
  check('sketch has touch-action: none', touchAction === 'none', touchAction);

  // screenshot mode hides the controls
  await page.tap('#shotBtn');
  check('screenshot mode covers the screen', await page.isVisible('.shot') && await page.$eval('.shot', el => { const r = el.getBoundingClientRect(); return r.width === innerWidth && r.height === innerHeight; }));
  const gone = () => page.$eval('#shotX', el => el.classList.contains('gone'));
  await page.waitForTimeout(3300);
  check('its close button and view choice fade away', await gone() && await page.$eval('#shotVw', el => el.classList.contains('gone')));
  const xAt = await page.$eval('#shotX', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.touchscreen.tap(xAt.x, xAt.y);
  check('a tap where the close button was brings it back at once', !(await gone()) && await page.isVisible('.shot'));
  await page.waitForTimeout(3300);
  await page.tap('#shotCap');
  check('a tap on the caption brings it back too', !(await gone()));
  await page.waitForTimeout(3300);
  await page.mouse.move(150, 500); await page.mouse.down(); await page.mouse.move(210, 540, { steps: 6 }); await page.mouse.up();
  check('a pan to frame the shot leaves it hidden', await gone());
  await page.touchscreen.tap(xAt.x, xAt.y);
  check('the first tap on its spot only shows it', !(await gone()) && await page.isVisible('.shot'));
  await page.waitForTimeout(700);
  await page.tap('#shotX');
  check('tap shows close, close exits', !(await page.isVisible('.shot')));

  // shared library: loads from the site, saving asks once for the passcode, delete is for everyone
  await page.waitForFunction(() => TVM.doc.lib.synced);
  check('shared TVs load from the site', await page.evaluate(() => TVM.doc.lib.tvs.some(x => x.model === 'SHARED65' && !x.local)));
  await page.evaluate(() => { TVM.doc.settings.mode = 'pro'; TVM.render(); });
  check('VESA inches from an older app read as millimeters', await page.evaluate(() => { const x = TVM.doc.lib.tvs.find(i => i.model === 'SHARED65'); return x.vesaW === 400 && x.vesaH === 300; }));
  // VESA spacing is typed in millimeters, so the fraction keys are off
  await page.tap('[data-k="tv.vesaW"]');
  await keys('clear', '4', '0', '0');
  check('VESA width typed in millimeters', (await tab0()).tv.vesaW === 400 && (await page.textContent('#kpVal')).endsWith(' mm') && !!(await page.$('#kp.mm')));
  await keys('next');
  check('VESA height is in millimeters too', !!(await page.$('#kp.mm')));
  await keys('next');
  check('the fraction keys come back for top holes to TV top', !(await page.$('#kp.mm')));
  await keys('done');
  check('the field shows millimeters', (await page.textContent('[data-k="tv.vesaW"] .fv')).replace(/\u00a0/g, ' ') === '400 mm');
  await page.tap('[data-libsave="tv"]');
  await page.fill('#modelIn', 'NEW55');
  await page.tap('.sheet [data-act="save"]');
  await page.waitForSelector('#passIn');
  await page.fill('#passIn', 'abc');
  await page.tap('.sheet [data-act="ok"]');
  await page.waitForFunction(() => TVM.doc.lib.tvs.some(x => x.model === 'NEW55' && !x.local));
  check('a saved TV goes to the site', shared.tvs.some(x => x.model === 'NEW55' && x.vesaW === 400));
  check('the passcode is kept on this phone', await page.evaluate(() => localStorage.getItem('tvmount.pass')) === 'abc');
  // rename: a new model number for everyone, and for the tab that uses it
  await page.tap('[data-lib="tv"]');
  const newId = await page.evaluate(() => TVM.doc.lib.tvs.find(x => x.model === 'NEW55').id);
  await page.tap(`.sheet [data-ren="tv:${newId}"]`);
  await page.fill('#modelIn', 'shared65');
  await page.tap('.sheet [data-act="save"]');
  check('a rename to a name already saved is refused', !!(await page.$('#modelIn')) && shared.tvs.some(x => x.model === 'NEW55'));
  await page.fill('#modelIn', 'NEW55B');
  await page.tap('.sheet [data-act="save"]');
  await page.waitForFunction(() => TVM.doc.lib.tvs.some(x => x.model === 'NEW55B' && !x.local));
  check('a rename changes it on the site', shared.tvs.some(x => x.model === 'NEW55B') && !shared.tvs.some(x => x.model === 'NEW55'));
  check('the tab that used the old name gets the new one', (await tab0()).tv.model === 'NEW55B');
  check('the list is back after a rename', !!(await page.$('.sheet #libBody')));
  await page.keyboard.press('Escape');
  await page.tap('[data-lib="tv"]');
  const del = `.sheet [data-del^="tv:"]`;
  const ids = await page.$$eval(del, b => b.map(x => x.dataset.del));
  const sharedId = ids.find(x => x.endsWith(':l1'));
  await page.tap(`.sheet [data-del="${sharedId}"]`); await page.tap(`.sheet [data-del="${sharedId}"]`);
  await page.waitForFunction(() => !TVM.doc.lib.tvs.some(x => x.model === 'SHARED65'));
  check('delete removes it from the site', !shared.tvs.some(x => x.model === 'SHARED65'));
  await page.keyboard.press('Escape');
  // studs for the lags: Auto on the left, a count with no inch mark
  await page.tap('[data-seg="mount.studsNeeded"] [data-v="2"]');
  check('2 studs picked', (await tab0()).mount.studsNeeded === 2);
  await page.tap('[data-seg="mount.studsNeeded"] [data-v="null"]');
  check('Auto clears the stud count', (await tab0()).mount.studsNeeded === null);
  // a countertop is placed like a mantle, with its own words
  const kind0 = (await tab0()).ref.kind;
  await page.tap('[data-seg="ref.kind"] [data-v="counter"]');
  check('Counter sets a mantle placement', (await tab0()).ref.kind === 'mantle' && (await tab0()).ref.mantle.what === 'counter');
  check('Counter words on the form', await page.$eval('[data-k="ref.mantle.value"] .fk', el => el.textContent.startsWith('Counter to')));
  check('Counter words on the results', await page.evaluate(() => TVM.r.ref.label) === 'above countertop');
  await page.tap('[data-seg="ref.kind"] [data-v="mantle"]');
  check('Mantle words come back', await page.$eval('[data-k="ref.mantle.value"] .fk', el => el.textContent.startsWith('Mantle to')));
  await page.tap(`[data-seg="ref.kind"] [data-v="${kind0}"]`);

  // a box already in the wall: Find a spot on the left, then its own fields
  await page.evaluate(() => { const t = TVM.doc.tabs.find(x => x.id === TVM.doc.current); t.box.on = true; TVM.render(); });
  check('Find a spot comes first', await page.$eval('[data-seg="box.place"] button', b => b.textContent === 'Find a spot' && b.classList.contains('on')));
  await page.tap('[data-seg="box.place"] [data-v="set"]');
  check('box corner fields', !!await page.$('[data-k="box.cornerH"]') && !!await page.$('[data-k="box.cornerX"]') && !await page.$('[data-k="box.margin"]'));
  check('Bottom left and Left of center line come first', await page.$eval('[data-seg="box.corner"] button', b => b.dataset.v === 'bl' && b.classList.contains('on')) && await page.$eval('[data-seg="box.side"] button', b => b.dataset.v === 'left' && b.classList.contains('on')));
  await page.tap('[data-seg="box.corner"] [data-v="tr"]');
  check('the drawing marks the chosen corner', (await tab0()).box.corner === 'tr' && !!await page.$('[data-sec="box"] svg circle.cn'));
  await page.evaluate(() => { const t = TVM.doc.tabs.find(x => x.id === TVM.doc.current); t.box.on = false; t.box.place = 'auto'; TVM.render(); });
  await page.evaluate(() => { TVM.doc.settings.mode = 'simple'; TVM.render(); });

  // restore a backup file
  const backup = await page.evaluate(() => Store.exportText(Object.assign(Store.blank(), { tabs: [Object.assign(Store.newTab('Den'), {})] })));
  const tmp = path.join(os.tmpdir(), 'tvmount-test-backup.json');
  fs.writeFileSync(tmp, backup);
  await page.setInputFiles('#importFile', tmp);
  await page.waitForSelector('.sheet [data-act="merge"]');
  await page.tap('.sheet [data-act="merge"]');
  names = await page.$$eval('#tabs [data-tab]:not(.add)', b => b.map(x => x.textContent));
  check('backup adds its tab', names.includes('Den') && names.length === 2, names);
  fs.unlinkSync(tmp);

  // iPhone Duo sizes (CSS px): closed upright and sideways keep the phone layout; open, the sketch and results sit
  // on the left, the form on the right, and the keypad covers only the form
  for (const [w, h, two] of [[382, 580, false], [594, 368, false], [669, 867, true], [951, 585, true]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }), p = await c.newPage();
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', e => errors.push(e.message));
    await p.goto(base); await p.waitForSelector('#form [data-k]');
    const box = s => p.$eval(s, el => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
    const sk = await box('.skc'), form = await box('#form');
    check(`${w}×${h}: ${two ? 'sketch on the left, form on the right' : 'one column'}`, two ? form.l >= sk.r && form.t < sk.b : form.t >= sk.b, { sk, form });
    const field = '#form [data-k="center.d"]';
    await p.tap(field); await p.waitForTimeout(500);
    const kp = await box('#kp'), f = await box(field);
    if (two) check(`${w}×${h}: the keypad leaves the sketch uncovered`, kp.l >= sk.r, { kp, sk });
    if (h > 400) check(`${w}×${h}: the field being typed shows above the keypad`, f.b <= kp.t && f.t >= 0, { f, kp });
    if (w === 669) {   // fold it shut with the keypad open: the keypad room moves to the page
      await p.setViewportSize({ width: 382, height: 580 }); await p.waitForTimeout(400);
      const pads = await p.evaluate(() => [document.getElementById('main').style.paddingBottom, document.getElementById('rcol').style.paddingBottom]);
      check('folding shut with the keypad open moves its room to the page', parseInt(pads[0]) > 100 && !pads[1], pads);
    }
    await c.close();
  }

  // offline, then an update
  const swOk = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'no serviceWorker';
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 8000))]);
    return reg ? 'ready' : 'timeout';
  });
  check('service worker is ready', swOk === 'ready', swOk);
  if (swOk === 'ready') {
    await page.reload(); await page.waitForSelector('#res .hero');
    await ctx.setOffline(true); offline = true;
    await page.reload();
    const off = await page.waitForSelector('#res .hero', { timeout: 5000 }).then(() => true).catch(() => false);
    check('loads with the network off', off && (await hero()).replace(/ /g, ' ') === '53 7/8"');
    await ctx.setOffline(false); offline = false;

    swBump = 'tvmount-v999';
    const updated = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const changed = new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', () => r(true), { once: true }));
      await reg.update();
      return Promise.race([changed, new Promise(r => setTimeout(() => r(false), 8000))]);
    });
    check('new version takes over', updated);
    const notice = await page.waitForSelector('.toast.tap.on', { timeout: 3000 }).then(() => page.textContent('.toast'), () => null);
    check('it says "Updated · Tap to reload"', notice === 'Updated · Tap to reload', notice);
    await page.reload(); await page.waitForSelector('#res .hero');
    const keysNow = await page.evaluate(() => caches.keys());
    check('old cache removed, new one in place', keysNow.includes('tvmount-v999') && !keysNow.some(k => k.startsWith('tvmount-') && k !== 'tvmount-v999'), keysNow);
    const names2 = await page.$$eval('#tabs [data-tab]:not(.add)', b => b.map(x => x.textContent));
    check('saved tabs survive the update', (await tab0()).tv.w === 57.125 && names2.includes('Den'), names2);
  }

  check('no console errors', errors.length === 0, errors);
  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
