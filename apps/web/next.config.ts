import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  eslint: {
    // Allow production builds to succeed even if there are ESLint errors
    ignoreDuringBuilds: true,
  },
  // Image optimization configuration
  images: {
    // QA-only: map the reserved seed host to local files so qa-seed fixtures
    // render without weakening the blob_url CHECK constraints. Inert in
    // production builds (NODE_ENV) and without the QA auth mode flag.
    ...(process.env.SPLOOT_QA_AUTH_MODE === 'enabled' && process.env.NODE_ENV !== 'production'
      ? { loader: 'custom' as const, loaderFile: './lib/qa/qa-image-loader.ts' }
      : {}),
    // Configure domains for Next.js Image optimization
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: '*.blob.vercel-storage.com',
      }
    ],
    // Enable WebP and AVIF formats for better compression
    formats: ['image/avif', 'image/webp'],
    // Set device sizes for responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    // Set image sizes for different breakpoints
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Compiler optimizations for production
  compiler: {
    // Remove all console statements in production builds
    // This provides zero runtime overhead - console calls are completely stripped
    removeConsole: process.env.NODE_ENV === "production" ? {
      // Keep console.error and console.warn for production debugging
      exclude: ["error", "warn"],
    } : false,
  },
  // Configure server actions and API routes
  experimental: {
    serverActions: {
      // Increase body size limit to 50MB for large image uploads
      // This applies globally to all server actions and API routes
      // Note: App Router doesn't support per-route body size limits
      bodySizeLimit: '50mb',
    },
  },
};

const pwaConfig = withPWA({
  dest: "public",
  register: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  // The root/start document is auth-dependent: signed-out users see landing,
  // signed-in users redirect to /app. Never let the service worker replay the
  // signed-out document after the Clerk session changes.
  cacheStartUrl: false,
  dynamicStartUrl: false,
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      // Custom: Vercel Blob Storage images (our app-specific requirement)
      {
        urlPattern: /^https:\/\/.*\.public\.blob\.vercel-storage\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "user-images",
          expiration: {
            maxEntries: 500,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
            purgeOnQuotaError: true,
          },
        },
      },
      // Custom: Search API with smart caching
      {
        urlPattern: /^\/api\/search(?:\/.*)?$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "api-search",
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 10 * 60, // 10 minutes
          },
        },
      },
    ],
  },
})(nextConfig);

export default pwaConfig;
