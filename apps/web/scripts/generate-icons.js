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
  border: '#2A2F37'
};

// Base SVG icon (enhanced version with better visual balance)
const createBaseSVG = (size, isMaskable = false) => {
  const padding = isMaskable ? size * 0.1 : 0; // 10% padding for maskable icons
  const innerSize = size - (padding * 2);
  const cornerRadius = innerSize * 0.25;
  const gridSize = innerSize * 0.15;
  const gridGap = innerSize * 0.05;
  const gridStart = padding + (innerSize - (gridSize * 2 + gridGap)) / 2;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Background -->
      <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="${colors.bg}"/>

      <!-- Surface layer -->
      <rect x="${padding + innerSize * 0.0625}" y="${padding + innerSize * 0.0625}"
            width="${innerSize * 0.875}" height="${innerSize * 0.875}"
            rx="${cornerRadius * 0.75}" fill="${colors.surface}"/>

      <!-- Inner surface -->
      <rect x="${padding + innerSize * 0.125}" y="${padding + innerSize * 0.125}"
            width="${innerSize * 0.75}" height="${innerSize * 0.75}"
            rx="${cornerRadius * 0.5}" fill="${colors.surfaceMuted}"/>

      <!-- Grid pattern - 2x2 with alternating colors -->
      <!-- Top-left: accentAlt -->
      <rect x="${gridStart}" y="${gridStart}"
            width="${gridSize}" height="${gridSize}"
            rx="${gridSize * 0.2}" fill="${colors.accentAlt}"/>

      <!-- Top-right: accent -->
      <rect x="${gridStart + gridSize + gridGap}" y="${gridStart}"
            width="${gridSize}" height="${gridSize}"
            rx="${gridSize * 0.2}" fill="${colors.accent}"/>

      <!-- Bottom-left: accent -->
      <rect x="${gridStart}" y="${gridStart + gridSize + gridGap}"
            width="${gridSize}" height="${gridSize}"
            rx="${gridSize * 0.2}" fill="${colors.accent}"/>

      <!-- Bottom-right: accentAlt -->
      <rect x="${gridStart + gridSize + gridGap}" y="${gridStart + gridSize + gridGap}"
            width="${gridSize}" height="${gridSize}"
            rx="${gridSize * 0.2}" fill="${colors.accentAlt}"/>

      <!-- Center dot -->
      <circle cx="${size / 2}" cy="${size / 2}" r="${innerSize * 0.05}"
              fill="${colors.text}" opacity="0.9"/>
    </svg>
  `;
};

// Upload icon for shortcut
const createUploadSVG = (size) => {
  const padding = size * 0.15;
  const iconSize = size - (padding * 2);

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${colors.surfaceMuted}"/>
      <path d="M ${size/2} ${padding} L ${size/2} ${size - padding}
               M ${padding * 1.5} ${size * 0.35} L ${size/2} ${padding} L ${size - padding * 1.5} ${size * 0.35}"
            stroke="${colors.accent}" stroke-width="${size * 0.06}" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="${padding}" y="${size * 0.6}" width="${iconSize}" height="${size * 0.06}"
            rx="${size * 0.03}" fill="${colors.accent}"/>
    </svg>
  `;
};

// Search icon for shortcut
const createSearchSVG = (size) => {
  const padding = size * 0.2;
  const circleRadius = size * 0.22;
  const centerX = size * 0.42;
  const centerY = size * 0.42;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${colors.surfaceMuted}"/>
      <circle cx="${centerX}" cy="${centerY}" r="${circleRadius}"
              stroke="${colors.accent}" stroke-width="${size * 0.06}" fill="none"/>
      <line x1="${centerX + circleRadius * 0.7}" y1="${centerY + circleRadius * 0.7}"
            x2="${size * 0.75}" y2="${size * 0.75}"
            stroke="${colors.accent}" stroke-width="${size * 0.06}" stroke-linecap="round"/>
    </svg>
  `;
};

// Safari pinned tab icon (monochrome)
const createSafariPinnedTabSVG = () => {
  return `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="5" height="5" rx="1" fill="black"/>
      <rect x="9" y="2" width="5" height="5" rx="1" fill="black"/>
      <rect x="2" y="9" width="5" height="5" rx="1" fill="black"/>
      <rect x="9" y="9" width="5" height="5" rx="1" fill="black"/>
      <circle cx="8" cy="8" r="1" fill="black"/>
    </svg>
  `;
};

// Icon configurations
const icons = [
  // PWA maskable icons
  { name: 'icon-72x72.png', size: 72, maskable: true },
  { name: 'icon-96x96.png', size: 96, maskable: true },
  { name: 'icon-128x128.png', size: 128, maskable: true },
  { name: 'icon-144x144.png', size: 144, maskable: true },
  { name: 'icon-152x152.png', size: 152, maskable: true },

  // PWA any purpose icons
  { name: 'icon-192x192.png', size: 192, maskable: false },
  { name: 'icon-384x384.png', size: 384, maskable: false },
  { name: 'icon-512x512.png', size: 512, maskable: false },

  // Favicon
  { name: 'favicon-16x16.png', size: 16, maskable: false },
  { name: 'favicon-32x32.png', size: 32, maskable: false },

  // Apple
  { name: 'apple-touch-icon.png', size: 180, maskable: false },

  // Microsoft tiles
  { name: 'mstile-70x70.png', size: 70, maskable: false },
  { name: 'mstile-150x150.png', size: 150, maskable: false },
  { name: 'mstile-310x310.png', size: 310, maskable: false },
];

// Shortcut icons
const shortcutIcons = [
  { name: 'upload-96x96.png', size: 96, type: 'upload' },
  { name: 'search-96x96.png', size: 96, type: 'search' },
];

async function generateIcons() {
  const iconsDir = path.join(__dirname, '..', 'public', 'icons');

  // Ensure icons directory exists
  try {
    await fs.mkdir(iconsDir, { recursive: true });
  } catch (err) {
    console.error('Error creating icons directory:', err);
  }

  console.log('🎨 Generating PWA icons for Sploot...\n');

  // Generate main icons
  for (const icon of icons) {
    try {
      const svg = createBaseSVG(icon.size, icon.maskable);
      const buffer = Buffer.from(svg);

      await sharp(buffer)
        .resize(icon.size, icon.size)
        .png()
        .toFile(path.join(iconsDir, icon.name));

      console.log(`✅ Generated ${icon.name} (${icon.maskable ? 'maskable' : 'any'})`);
    } catch (err) {
      console.error(`❌ Error generating ${icon.name}:`, err);
    }
  }

  // Generate wide tile for Windows
  try {
    const svg = createBaseSVG(310, false);
    const buffer = Buffer.from(svg);

    await sharp(buffer)
      .resize(310, 150, { fit: 'contain', background: colors.bg })
      .png()
      .toFile(path.join(iconsDir, 'mstile-310x150.png'));

    console.log('✅ Generated mstile-310x150.png (wide)');
  } catch (err) {
    console.error('❌ Error generating wide tile:', err);
  }

  // Generate shortcut icons
  for (const icon of shortcutIcons) {
    try {
      let svg;
      if (icon.type === 'upload') {
        svg = createUploadSVG(icon.size);
      } else if (icon.type === 'search') {
        svg = createSearchSVG(icon.size);
      }

      const buffer = Buffer.from(svg);

      await sharp(buffer)
        .resize(icon.size, icon.size)
        .png()
        .toFile(path.join(iconsDir, icon.name));

      console.log(`✅ Generated ${icon.name} (shortcut)`);
    } catch (err) {
      console.error(`❌ Error generating ${icon.name}:`, err);
    }
  }

  // Generate Safari pinned tab icon
  try {
    const svg = createSafariPinnedTabSVG();
    await fs.writeFile(path.join(iconsDir, 'safari-pinned-tab.svg'), svg);
    console.log('✅ Generated safari-pinned-tab.svg');
  } catch (err) {
    console.error('❌ Error generating Safari pinned tab:', err);
  }

  // Create favicon.ico (multi-resolution)
  try {
    const svg = createBaseSVG(32, false);
    const buffer = Buffer.from(svg);

    await sharp(buffer)
      .resize(32, 32)
      .toFile(path.join(iconsDir, 'favicon.ico'));

    console.log('✅ Generated favicon.ico');
  } catch (err) {
    console.error('❌ Error generating favicon.ico:', err);
  }

  console.log('\n🎉 Icon generation complete!');
  console.log('📁 Icons saved to: public/icons/');
  console.log('\n💡 Next steps:');
  console.log('   - Build the app: pnpm build');
  console.log('   - Deploy to Vercel for PWA functionality');
}

// Run the script
generateIcons().catch(console.error);