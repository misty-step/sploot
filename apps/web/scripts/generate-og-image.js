const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { BRAND_COLORS, SPLASH_SCREENS } = require('./pwa-assets.cjs');

// Design system colors from AESTHETIC.md
const colors = {
  bg: BRAND_COLORS.background,
  surface: '#2d255e',
  surfaceMuted: '#241d50',
  accent: BRAND_COLORS.cyan,
  accentAlt: BRAND_COLORS.magenta,
  text: BRAND_COLORS.ink,
  mutedText: BRAND_COLORS.paper,
  border: BRAND_COLORS.purple,
};

const readBrandMark = async () => {
  const source = await fs.readFile(path.join(__dirname, '..', 'public', 'icons', 'icon.svg'), 'utf8');
  const contents = source.match(/<svg[^>]*>([\s\S]*)<\/svg>/i)?.[1];
  if (!contents) throw new Error('icons/icon.svg must contain an SVG mark');
  return contents;
};

// Create OG image (1200x630 for social media)
const createOGImageSVG = (markContents) => {
  const width = 1200;
  const height = 630;

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Background gradient -->
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${colors.bg};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${colors.surface};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>

      <!-- Surface card -->
      <rect x="80" y="80" width="${width - 160}" height="${height - 160}"
            rx="32" fill="${colors.surface}" stroke="${colors.border}" stroke-width="2"/>

      <!-- Grid pattern background -->
      <g opacity="0.1">
        ${Array.from({ length: 20 }, (_, i) =>
          Array.from({ length: 10 }, (_, j) => {
            const x = 100 + i * 50;
            const y = 100 + j * 50;
            const color = (i + j) % 2 === 0 ? colors.accent : colors.accentAlt;
            return `<rect x="${x}" y="${y}" width="40" height="40" rx="8" fill="${color}"/>`;
          }).join('')
        ).join('')}
      </g>

      <!-- Logo/Icon -->
      <g transform="translate(${width/2 - 100}, 140)">
        <!-- 200x200 icon -->
        <rect x="0" y="0" width="200" height="200" rx="50" fill="${colors.surfaceMuted}"/>

        <g transform="translate(38 38) scale(3.875)">${markContents}</g>
      </g>

      <!-- Text content -->
      <text x="${width/2}" y="400" text-anchor="middle"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            font-size="72" font-weight="bold" fill="${colors.text}">
        sploot
      </text>

      <text x="${width/2}" y="460" text-anchor="middle"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            font-size="32" font-weight="normal" fill="${colors.mutedText}">
        Your personal meme pile
      </text>

      <text x="${width/2}" y="510" text-anchor="middle"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            font-size="24" font-weight="normal" fill="${colors.mutedText}">
        Save it anywhere. Find it with words.
      </text>

      <!-- Accent bar -->
      <rect x="400" y="550" width="400" height="4" rx="2" fill="${colors.accent}"/>
    </svg>
  `;
};

// Create splash screens for PWA
const createSplashScreenSVG = (width, height, markContents) => {
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="${colors.bg}"/>

      <!-- Icon centered -->
      <g transform="translate(${width/2 - 128}, ${height/2 - 128})">
        <!-- 256x256 icon -->
        <rect x="0" y="0" width="256" height="256" rx="64" fill="${colors.surface}"/>
        <rect x="16" y="16" width="224" height="224" rx="48" fill="${colors.surfaceMuted}"/>

        <g transform="translate(48 48) scale(4)">${markContents}</g>
      </g>

      <!-- App name -->
      <text x="${width/2}" y="${height/2 + 180}" text-anchor="middle"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            font-size="${Math.min(width, height) * 0.08}" font-weight="bold" fill="${colors.text}">
        sploot
      </text>
    </svg>
  `;
};

async function generateOGAndSplashImages() {
  const publicDir = path.join(__dirname, '..', 'public');
  const markContents = await readBrandMark();

  console.log('🖼️  Generating OG image and splash screens...\n');

  const ogSvg = createOGImageSVG(markContents);
  await sharp(Buffer.from(ogSvg))
    .resize(1200, 630)
    .png()
    .toFile(path.join(publicDir, 'og-image.png'));
  console.log('✅ Generated og-image.png (1200x630)');

  const splashDir = path.join(publicDir, 'splash');
  await fs.mkdir(splashDir, { recursive: true });

  for (const screen of SPLASH_SCREENS) {
    const svg = createSplashScreenSVG(screen.width, screen.height, markContents);
    await sharp(Buffer.from(svg))
      .resize(screen.width, screen.height)
      .jpeg({ quality: 90 })
      .toFile(path.join(splashDir, screen.name));
    console.log(`✅ Generated ${screen.name}`);
  }

  console.log('\n🎉 OG image and splash screens generated!');
  console.log('📁 OG image: public/og-image.png');
  console.log('📁 Splash screens: public/splash/');
}

// Run the script
generateOGAndSplashImages().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
