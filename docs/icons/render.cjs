// Renders docs/icons/<app>.svg to <app>/icon-512.png and <app>/icon-180.png, and the light versions that the homepage
// shows in Day to <app>/icon-180-light.png. The apps themselves use only the dark icons.
// Needs Playwright on NODE_PATH (see CLAUDE.md):  NODE_PATH=<folder> node docs/icons/render.cjs
const { webkit } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const APPS = ['calculator', 'counter', 'converter', 'triangle', 'parking', 'tvmount', 'roadtrip'];
// Light version: white tile, and a deeper glyph color that stands out on white. favicon.svg uses the same colors.
const HOME = ['calculator', 'counter', 'converter', 'triangle', 'tvmount', 'roadtrip'];
const LIGHT = { '#000': '#fff', '#9F8FEF': '#8270DB', '#4BCE97': '#22A06B', '#6CC3E0': '#1D9AAA', '#FEA362': '#E56910', '#579DFF': '#1D7AFC', '#E774BB': '#CD519D' };

(async () => {
  const browser = await webkit.launch();
  for (const size of [512, 180]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    for (const app of APPS) {
      const svg = fs.readFileSync(path.join(__dirname, app + '.svg'), 'utf8');
      await page.setContent(`<style>html,body{margin:0;background:#000}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
      await page.screenshot({ path: path.join(root, app, `icon-${size}.png`) });
    }
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  for (const app of HOME) {
    let svg = fs.readFileSync(path.join(__dirname, app + '.svg'), 'utf8');
    for (const [dark, light] of Object.entries(LIGHT)) svg = svg.replaceAll(`"${dark}"`, `"${light}"`);
    await page.setContent(`<style>html,body{margin:0;background:#fff}svg{display:block;width:180px;height:180px}</style>${svg}`);
    await page.screenshot({ path: path.join(root, app, 'icon-180-light.png') });
  }
  await browser.close();
  console.log(`Rendered ${APPS.length} icons at 512 and 180, and ${HOME.length} light icons at 180.`);
})().catch(e => { console.error(e); process.exit(1); });
