const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

// Design system colors from AESTHETIC.md
const colors = {
  bg: '#0B0C0E',
  surface: '#14171A',
  surfaceMuted: '#1B1F24',
  accent: '#7C5CFF',
  accentAlt: '#B6FF6E',
  text: '#E6E8EB',
  mutedText: '#B3B7BE',
  border: '#2A2F37'
};

// Create OG image (1200x630 for social media)
const createOGImageSVG = () => {
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

        <!-- Grid pattern -->
        <rect x="30" y="30" width="60" height="60" rx="12" fill="${colors.accentAlt}"/>
        <rect x="110" y="30" width="60" height="60" rx="12" fill="${colors.accent}"/>
        <rect x="30" y="110" width="60" height="60" rx="12" fill="${colors.accent}"/>
        <rect x="110" y="110" width="60" height="60" rx="12" fill="${colors.accentAlt}"/>

        <!-- Center dot -->
        <circle cx="100" cy="100" r="12" fill="${colors.text}" opacity="0.9"/>
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
        Your Personal Meme Library
      </text>

      <text x="${width/2}" y="510" text-anchor="middle"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            font-size="24" font-weight="normal" fill="${colors.mutedText}">
        Lightning-fast semantic search for your meme collection
      </text>

      <!-- Accent bar -->
      <rect x="400" y="550" width="400" height="4" rx="2" fill="${colors.accent}"/>
    </svg>
  `;
};

// Create splash screens for PWA
const createSplashScreenSVG = (width, height) => {
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="${colors.bg}"/>

      <!-- Icon centered -->
      <g transform="translate(${width/2 - 128}, ${height/2 - 128})">
        <!-- 256x256 icon -->
        <rect x="0" y="0" width="256" height="256" rx="64" fill="${colors.surface}"/>
        <rect x="16" y="16" width="224" height="224" rx="48" fill="${colors.surfaceMuted}"/>

        <!-- Grid pattern -->
        <rect x="48" y="48" width="70" height="70" rx="14" fill="${colors.accentAlt}"/>
        <rect x="138" y="48" width="70" height="70" rx="14" fill="${colors.accent}"/>
        <rect x="48" y="138" width="70" height="70" rx="14" fill="${colors.accent}"/>
        <rect x="138" y="138" width="70" height="70" rx="14" fill="${colors.accentAlt}"/>

        <!-- Center dot -->
        <circle cx="128" cy="128" r="16" fill="${colors.text}" opacity="0.9"/>
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

  console.log('🖼️  Generating OG image and splash screens...\n');

  // Generate OG image
  try {
    const ogSvg = createOGImageSVG();
    const buffer = Buffer.from(ogSvg);

    await sharp(buffer)
      .resize(1200, 630)
      .png()
      .toFile(path.join(publicDir, 'og-image.png'));

    console.log('✅ Generated og-image.png (1200x630)');
  } catch (err) {
    console.error('❌ Error generating OG image:', err);
  }

  // Generate splash screens
  const splashScreens = [
    { width: 640, height: 1136, name: 'apple-splash-640-1136.jpg' },
    { width: 750, height: 1334, name: 'apple-splash-750-1334.jpg' },
    { width: 1242, height: 2208, name: 'apple-splash-1242-2208.jpg' },
    { width: 1125, height: 2436, name: 'apple-splash-1125-2436.jpg' },
    { width: 1536, height: 2048, name: 'apple-splash-1536-2048.jpg' },
    { width: 1668, height: 2388, name: 'apple-splash-1668-2388.jpg' },
    { width: 2048, height: 2732, name: 'apple-splash-2048-2732.jpg' },
  ];

  // Create splash directory
  const splashDir = path.join(publicDir, 'splash');
  try {
    await fs.mkdir(splashDir, { recursive: true });
  } catch (err) {
    console.error('Error creating splash directory:', err);
  }

  for (const screen of splashScreens) {
    try {
      const svg = createSplashScreenSVG(screen.width, screen.height);
      const buffer = Buffer.from(svg);

      await sharp(buffer)
        .resize(screen.width, screen.height)
        .jpeg({ quality: 90 })
        .toFile(path.join(splashDir, screen.name));

      console.log(`✅ Generated ${screen.name}`);
    } catch (err) {
      console.error(`❌ Error generating ${screen.name}:`, err);
    }
  }

  console.log('\n🎉 OG image and splash screens generated!');
  console.log('📁 OG image: public/og-image.png');
  console.log('📁 Splash screens: public/splash/');
}

// Run the script
generateOGAndSplashImages().catch(console.error);