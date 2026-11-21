// Renders the homepage icons: docs/icons/home.svg to apple-touch-icon.png (180, full bleed; iOS rounds the corners)
// and favicon.svg to favicon.ico (16, 32 and 48, no background). The ICO holds the three PNGs as they are.
// Needs Playwright on NODE_PATH (see CLAUDE.md):  NODE_PATH=<folder> node docs/icons/render-home.cjs
const { webkit } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const ICO_SIZES = [16, 32, 48];

async function render(browser, src, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const svg = fs.readFileSync(src, 'utf8');
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  return png;
}

// An ICO file is a 6-byte header, a 16-byte entry per image, then the images. Entries may be whole PNG files.
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size, e);
    header.writeUInt8(size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs.map(p => p.png)]);
}

(async () => {
  const browser = await webkit.launch();
  fs.writeFileSync(path.join(root, 'apple-touch-icon.png'), await render(browser, path.join(__dirname, 'home.svg'), 180));
  const pngs = [];
  for (const size of ICO_SIZES) pngs.push({ size, png: await render(browser, path.join(root, 'favicon.svg'), size) });
  fs.writeFileSync(path.join(root, 'favicon.ico'), ico(pngs));
  await browser.close();
  console.log(`Rendered apple-touch-icon.png and favicon.ico (${ICO_SIZES.join(', ')}).`);
})().catch(e => { console.error(e); process.exit(1); });
