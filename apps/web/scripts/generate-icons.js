const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { BRAND_COLORS, PWA_ICONS, SUPPORTING_ICONS, SCREENSHOTS } = require('./pwa-assets.cjs');

const publicDir = path.join(__dirname, '..', 'public');
const appDir = path.join(__dirname, '..', 'app');

async function readBrandMark() {
  const source = await fs.readFile(path.join(publicDir, 'icons', 'icon.svg'), 'utf8');
  const contents = source.match(/<svg[^>]*>([\s\S]*)<\/svg>/i)?.[1];
  if (!contents) throw new Error('icons/icon.svg must contain an SVG mark');
  return contents;
}

function createBrandSVG(size, markContents, maskable = false) {
  // Android's maskable safe zone is the central 80%. Keep the mark inside
  // 58% so circular and squircle launchers cannot crop either loop.
  const markScale = maskable ? 0.58 : 0.76;
  const markOffset = size * ((1 - markScale) / 2);
  const markTransform = `translate(${markOffset} ${markOffset}) scale(${(size * markScale) / 32})`;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${BRAND_COLORS.background}"/>
      <g transform="${markTransform}">${markContents}</g>
    </svg>
  `;
}

function createUploadSVG(size) {
  const padding = size * 0.2;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${BRAND_COLORS.background}"/>
      <path d="M ${size / 2} ${padding}V${size - padding}M ${padding * 1.5} ${size * 0.38}L${size / 2} ${padding}L${size - padding * 1.5} ${size * 0.38}" stroke="${BRAND_COLORS.cyan}" stroke-width="${size * 0.07}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M ${padding} ${size * 0.72}H${size - padding}" stroke="${BRAND_COLORS.magenta}" stroke-width="${size * 0.07}" stroke-linecap="round"/>
    </svg>
  `;
}

function createSearchSVG(size) {
  const center = size * 0.42;
  const radius = size * 0.22;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${BRAND_COLORS.background}"/>
      <circle cx="${center}" cy="${center}" r="${radius}" stroke="${BRAND_COLORS.cyan}" stroke-width="${size * 0.07}"/>
      <path d="M ${center + radius * 0.7} ${center + radius * 0.7}L${size * 0.76} ${size * 0.76}" stroke="${BRAND_COLORS.magenta}" stroke-width="${size * 0.07}" stroke-linecap="round"/>
    </svg>
  `;
}

function createWideTileSVG(width, height, markContents) {
  const markSize = height * 0.58;
  const markX = height * 0.18;
  const markY = (height - markSize) / 2;
  const textX = markX + markSize + height * 0.16;
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="${BRAND_COLORS.background}"/>
      <g transform="translate(${markX} ${markY}) scale(${markSize / 32})">${markContents}</g>
      <text x="${textX}" y="${height * 0.62}" font-family="Arial, sans-serif" font-size="${height * 0.3}" font-weight="700" fill="${BRAND_COLORS.ink}">sploot</text>
    </svg>
  `;
}

function createScreenshotSVG(width, height, markContents) {
  const scale = Math.min(width / 1920, height / 1080);
  const cardX = width * 0.08;
  const cardY = height * 0.1;
  const cardWidth = width * 0.84;
  const cardHeight = height * 0.8;
  const tileY = cardY + cardHeight * 0.44;
  const logoSize = Math.max(42, 170 * scale);
  const logoX = cardX + width * 0.05;
  const logoY = cardY + height * 0.08;
  const gridColumns = width < 600 ? 2 : 4;
  const gridRows = Math.ceil(4 / gridColumns);
  const gridGap = Math.max(10, width * 0.02);
  const gridWidth = cardWidth - width * 0.1;
  const gridHeight = cardHeight * 0.44;
  const tileWidth = (gridWidth - gridGap * (gridColumns - 1)) / gridColumns;
  const tileHeight = Math.min(cardHeight * 0.27, (gridHeight - gridGap * (gridRows - 1)) / gridRows);
  const tileColors = [BRAND_COLORS.cyan, BRAND_COLORS.magenta, BRAND_COLORS.purple, BRAND_COLORS.ink];
  const tiles = tileColors.map((color, index) => {
    const column = index % gridColumns;
    const row = Math.floor(index / gridColumns);
    const x = cardX + width * 0.05 + column * (tileWidth + gridGap);
    const y = tileY + row * (tileHeight + gridGap);
    return `<rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="${Math.max(10, 18 * scale)}" fill="${color}"/>`;
  }).join('');

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="${BRAND_COLORS.paper}"/>
      <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="${Math.max(18, 32 * scale)}" fill="${BRAND_COLORS.panel}" stroke="${BRAND_COLORS.background}" stroke-width="${Math.max(3, 6 * scale)}"/>
      <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${height * 0.12}" rx="${Math.max(18, 32 * scale)}" fill="${BRAND_COLORS.background}"/>
      <g transform="translate(${logoX} ${logoY}) scale(${logoSize / 32})">${markContents}</g>
      <text x="${logoX + logoSize + width * 0.018}" y="${logoY + logoSize * 0.65}" font-family="Arial, sans-serif" font-size="${Math.max(24, 52 * scale)}" font-weight="700" fill="${BRAND_COLORS.ink}">sploot</text>
      <text x="${cardX + width * 0.05}" y="${cardY + cardHeight * 0.3}" font-family="Arial, sans-serif" font-size="${Math.max(20, 42 * scale)}" font-weight="700" fill="${BRAND_COLORS.background}">your meme pile</text>
      <text x="${cardX + width * 0.05}" y="${cardY + cardHeight * 0.37}" font-family="Arial, sans-serif" font-size="${Math.max(13, 24 * scale)}" fill="${BRAND_COLORS.background}">save it anywhere. find it with words.</text>
      ${tiles}
    </svg>
  `;
}

async function writePng(svg, outputPath, width, height) {
  await sharp(Buffer.from(svg)).resize(width, height).png().toFile(outputPath);
}

async function writeIco(outputPath, images) {
  const pngs = await Promise.all(images.map(({ svg, size }) =>
    sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
  ));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = Buffer.alloc(16 * pngs.length);
  let offset = header.length + entries.length;
  pngs.forEach((png, index) => {
    const entryOffset = index * 16;
    const size = images[index].size;
    entries[entryOffset] = size === 256 ? 0 : size;
    entries[entryOffset + 1] = size === 256 ? 0 : size;
    entries[entryOffset + 2] = 0;
    entries[entryOffset + 3] = 0;
    entries.writeUInt16LE(1, entryOffset + 4);
    entries.writeUInt16LE(32, entryOffset + 6);
    entries.writeUInt32LE(png.length, entryOffset + 8);
    entries.writeUInt32LE(offset, entryOffset + 12);
    offset += png.length;
  });
  await fs.writeFile(outputPath, Buffer.concat([header, entries, ...pngs]));
}

async function generateIcons() {
  const iconsDir = path.join(publicDir, 'icons');
  const screenshotsDir = path.join(publicDir, 'screenshots');
  await fs.mkdir(iconsDir, { recursive: true });
  await fs.mkdir(screenshotsDir, { recursive: true });
  const markContents = await readBrandMark();

  console.log('🎨 Generating color PWA assets for Sploot...\n');

  for (const icon of PWA_ICONS) {
    await writePng(
      createBrandSVG(icon.size, markContents, icon.maskable),
      path.join(iconsDir, icon.name),
      icon.size,
      icon.size,
    );
    console.log(`✅ Generated ${icon.name} (${icon.purpose})`);
  }

  const supportingSvgs = new Map([
    ['favicon-16x16.png', createBrandSVG(16, markContents)],
    ['favicon-32x32.png', createBrandSVG(32, markContents)],
    ['apple-touch-icon.png', createBrandSVG(180, markContents)],
    ['mstile-70x70.png', createBrandSVG(70, markContents)],
    ['mstile-150x150.png', createBrandSVG(150, markContents)],
    ['mstile-310x310.png', createBrandSVG(310, markContents)],
    ['mstile-310x150.png', createWideTileSVG(310, 150, markContents)],
    ['upload-96x96.png', createUploadSVG(96)],
    ['search-96x96.png', createSearchSVG(96)],
  ]);
  for (const icon of SUPPORTING_ICONS) {
    const svg = supportingSvgs.get(icon.name);
    const width = icon.width ?? icon.size;
    const height = icon.height ?? icon.size;
    if (!svg) throw new Error(`No SVG generator for ${icon.name}`);
    await writePng(svg, path.join(iconsDir, icon.name), width, height);
    console.log(`✅ Generated ${icon.name}`);
  }

  for (const screenshot of SCREENSHOTS) {
    await writePng(
      createScreenshotSVG(screenshot.width, screenshot.height, markContents),
      path.join(screenshotsDir, screenshot.name),
      screenshot.width,
      screenshot.height,
    );
    console.log(`✅ Generated screenshots/${screenshot.name}`);
  }

  const safariSvg = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="8" r="4.5" stroke="black" stroke-width="1.5"/>
      <circle cx="10" cy="8" r="4.5" stroke="black" stroke-width="1.5"/>
    </svg>
  `.trim() + '\n';
  await fs.writeFile(path.join(iconsDir, 'safari-pinned-tab.svg'), safariSvg);

  const any192 = PWA_ICONS.find((icon) => icon.name === 'icon-192x192.png');
  const any512 = PWA_ICONS.find((icon) => icon.name === 'icon-512x512.png');
  await fs.copyFile(path.join(iconsDir, 'icon.svg'), path.join(appDir, 'icon.svg'));
  await writePng(createBrandSVG(180, markContents), path.join(appDir, 'apple-icon.png'), 180, 180);
  await writePng(createBrandSVG(32, markContents), path.join(appDir, 'icon-32.png'), 32, 32);
  await writePng(createBrandSVG(any192.size, markContents), path.join(appDir, 'icon-192.png'), 192, 192);
  await writePng(createBrandSVG(any512.size, markContents), path.join(appDir, 'icon-512.png'), 512, 512);
  await writeIco(path.join(iconsDir, 'favicon.ico'), [
    { size: 16, svg: createBrandSVG(16, markContents) },
    { size: 32, svg: createBrandSVG(32, markContents) },
  ]);
  await fs.copyFile(path.join(iconsDir, 'favicon.ico'), path.join(appDir, 'favicon.ico'));
  console.log('✅ Generated canonical Next metadata assets');
  console.log('✅ Generated safari-pinned-tab.svg');
}

generateIcons().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
