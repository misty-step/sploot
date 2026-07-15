const BRAND_COLORS = {
  background: '#1c1547',
  paper: '#cfe7ff',
  panel: '#ffffff',
  cyan: '#63c3ff',
  magenta: '#ff8ed7',
  ink: '#fff3dc',
  purple: '#a78aff',
};

const PWA_ICONS = [
  { name: 'icon-72x72.png', size: 72, purpose: 'maskable', maskable: true },
  { name: 'icon-96x96.png', size: 96, purpose: 'maskable', maskable: true },
  { name: 'icon-128x128.png', size: 128, purpose: 'maskable', maskable: true },
  { name: 'icon-144x144.png', size: 144, purpose: 'maskable', maskable: true },
  { name: 'icon-152x152.png', size: 152, purpose: 'maskable', maskable: true },
  { name: 'icon-192x192.png', size: 192, purpose: 'any', maskable: false },
  { name: 'icon-192x192-maskable.png', size: 192, purpose: 'maskable', maskable: true },
  { name: 'icon-384x384.png', size: 384, purpose: 'any', maskable: false },
  { name: 'icon-384x384-maskable.png', size: 384, purpose: 'maskable', maskable: true },
  { name: 'icon-512x512.png', size: 512, purpose: 'any', maskable: false },
  { name: 'icon-512x512-maskable.png', size: 512, purpose: 'maskable', maskable: true },
];

const SUPPORTING_ICONS = [
  { name: 'favicon-16x16.png', size: 16, maskable: false },
  { name: 'favicon-32x32.png', size: 32, maskable: false },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
  { name: 'mstile-70x70.png', size: 70, maskable: false },
  { name: 'mstile-150x150.png', size: 150, maskable: false },
  { name: 'mstile-310x310.png', size: 310, maskable: false },
  { name: 'mstile-310x150.png', width: 310, height: 150, maskable: false },
  { name: 'upload-96x96.png', size: 96, maskable: false },
  { name: 'search-96x96.png', size: 96, maskable: false },
];

const SCREENSHOTS = [
  { name: 'desktop-home.png', width: 1920, height: 1080 },
  { name: 'mobile-home.png', width: 390, height: 844 },
];

const SCREENSHOT_CAPTURE = {
  captureVersion: 1,
  seedId: 'sploot-pwa-qa-v1',
  route: '/app',
  userId: 'qa-design-user',
  assetCount: 24,
  shuffleSeed: 424242,
  minVisibleTiles: 2,
  minFullyInsideImages: 1,
  minScrollProbeCount: 3,
};

const SPLASH_SCREENS = [
  { name: 'apple-splash-640-1136.jpg', width: 640, height: 1136 },
  { name: 'apple-splash-750-1334.jpg', width: 750, height: 1334 },
  { name: 'apple-splash-1242-2208.jpg', width: 1242, height: 2208 },
  { name: 'apple-splash-1125-2436.jpg', width: 1125, height: 2436 },
  { name: 'apple-splash-1536-2048.jpg', width: 1536, height: 2048 },
  { name: 'apple-splash-1668-2388.jpg', width: 1668, height: 2388 },
  { name: 'apple-splash-2048-2732.jpg', width: 2048, height: 2732 },
];

const SVG_ASSETS = [
  { name: 'icon.svg', purpose: 'brand' },
  { name: 'apple-touch-icon-source.svg', purpose: 'brand' },
  { name: 'safari-pinned-tab.svg', purpose: 'monochrome' },
];

module.exports = {
  BRAND_COLORS,
  PWA_ICONS,
  SUPPORTING_ICONS,
  SCREENSHOTS,
  SCREENSHOT_CAPTURE,
  SPLASH_SCREENS,
  SVG_ASSETS,
};
