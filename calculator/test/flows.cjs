// Drives Calculator in WebKit at iPhone size: standard order, exact fractions, errors, history, offline and an
// app update. Exits 1 on a failed check or console error.
//   NODE_PATH=/path/to/node_modules node calculator/test/flows.cjs
const { webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
let swBump = null;   // when set, sw.js is served with this cache name, like a deploy would
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
  if (swBump && p === '/calculator/sw.js') body = Buffer.from(body.toString().replace(/const CACHE = (['"])[^'"]+\1/, `const CACHE = '${swBump}'`));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !ok ? ' — ' + JSON.stringify(info) : ''}`); };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/calculator/`;
  const browser = await webkit.launch();
  const errors = [];
  const watch = p => { p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', e => errors.push(e.message)); return p; };
  // Routes and the clock need no service worker; the offline checks at the end turn it on.
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = watch(await ctx.newPage());

  await page.goto(base);
  await page.waitForSelector('#value');
  // Keyboard: digits fill the whole number, space moves to the numerator, "/" to the denominator; ":" divides
  const keys = async s => { for (const ch of s) await page.keyboard.press(ch === ' ' ? 'Space' : ch === '=' ? 'Enter' : ch); };
  const answer = async s => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await keys(s); return page.textContent('#value'); };
  const exact = () => page.$eval('#alt b', e => e.textContent);

  // × and ÷ before + and −
  check('2 + 3 × 4 = 14', await answer('2+3*4=') === '14');
  check('2 × 3 + 4 × 5 = 26', await answer('2*3+4*5=') === '26');
  check('10 − 6 ÷ 2 = 7', await answer('10-6:2=') === '7');
  check('8 ÷ 4 ÷ 2 = 1, left to right', await answer('8:4:2=') === '1');
  check('10 − 2 − 3 = 5, left to right', await answer('10-2-3=') === '5');
  check('while typing, 2 + 3 × shows 3', await answer('2+3*') === '3');
  check('while typing, 2 + 3 × 4 + shows 14', await answer('2+3*4+') === '14');
  check('while typing, 2 × 3 × shows 6', await answer('2*3*') === '6');
  check('a new operator replaces the last: 2 + × 3 = 6', await answer('2+*3=') === '6');
  check('= with no number repeats the shown one: 2 + 3 × = 11', await answer('2+3*=') === '11');
  await answer('2+3*4='); await keys('+1=');
  check('an answer goes on: … = + 1 = 15', await page.textContent('#value') === '15');

  // Fractions
  await answer('1 3/4+15/16=');
  check('1 3/4 + 15/16 = 2 11/16', await exact() === '43/16');
  await answer('1/2+1/4*2=');
  check('1/2 + 1/4 × 2 = 1', await page.textContent('#value') === '1');
  await answer('1/3=');
  check('1/3 shows the nearest 1/16', (await page.textContent('#alt')) === '1/3·0.3333·≈ 5/16 to 1/16', await page.textContent('#alt'));
  await answer('1/9967*1/9949*1/9941*9973*1/9973=');
  check('exact past the largest safe number on the way', await exact() === '1/985766290703', await exact());
  check('an answer too big says so', await answer('1/9973*1/9967*1/9949*1/9941=') === 'Too big to show exactly.');

  // Errors
  check('a zero denominator', await answer('7/0=') === "A denominator can't be zero.");
  check('divide by zero', await answer('5:0=') === "Can't divide by zero.");
  check('divide by zero inside a chain', await answer('2+5:0=') === "Can't divide by zero.");
  check('a number after an error starts over', await answer('5:0=') && (await keys('4='), await page.textContent('#value')) === '4');

  // History
  await answer('6+2*3=');
  const h = await page.evaluate(() => JSON.parse(localStorage.getItem('calculator.hist'))[0]);
  check('history keeps the expression and the answer', h.expr === '6 + 2 × 3' && h.res.n === 12 && h.res.d === 1, h);
  await page.reload(); await page.waitForSelector('#value');
  check('history is kept after a reload', (await page.evaluate(() => JSON.parse(localStorage.getItem('calculator.hist'))[0].expr)) === '6 + 2 × 3');

  // Offline, and an update, with the service worker on
  {
    const c = await browser.newContext({ ...devices['iPhone 13'] }), p = watch(await c.newPage());
    await p.goto(base);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload(); await p.waitForSelector('#value');
    check('the service worker is in charge after a reload', (await p.evaluate(() => navigator.serviceWorker.controller?.scriptURL || '')).endsWith('/calculator/sw.js'));
    await p.waitForTimeout(300);
    check('no update notice on the first install', !(await p.$('.toast.tap')));
    await c.setOffline(true);
    const off = await p.reload().then(r => r && r.status(), () => 0);
    check('opens with the network off', off === 200 && !!(await p.$('#value')));
    await c.setOffline(false);
    swBump = 'calculator-v999';
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    const notice = await p.waitForSelector('.toast.tap.on', { timeout: 8000 }).then(() => p.textContent('.toast'), () => null);
    check('an update says "Updated · Tap to reload"', notice === 'Updated · Tap to reload', notice);
    if (notice) {
      await Promise.all([p.waitForEvent('load'), p.tap('.toast')]);
      const keys = await p.evaluate(() => caches.keys());
      check('tapping it reloads, on the new cache only', keys.includes('calculator-v999') && !keys.some(k => k.startsWith('calculator-') && k !== 'calculator-v999'), keys);
    }
    swBump = null;
    await c.close();
  }

  check('no console errors', errors.length === 0, errors);
  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
