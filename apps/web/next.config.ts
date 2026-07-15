import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";
import {
  IMAGE_DEVICE_SIZES,
  IMAGE_IMAGE_SIZES,
  IMAGE_FORMATS,
  IMAGE_MINIMUM_CACHE_TTL,
} from "./lib/image-config";
import { isQaLocalAuthEnabled } from "./lib/auth/qa-local";

const nextConfig: NextConfig = {
  output: "standalone",
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Legacy route aliases live here as plain HTTP redirects. They used to be
  // RSC redirect() pages, but next@16.2.10's app-router throws "Rendered
  // more hooks than during the previous render" when hydrating an RSC
  // redirect arrival (crash in next's own Router component — backlog 060);
  // config-level redirects sidestep the RSC payload entirely.
  async redirects() {
    return [
      {
        source: "/app/upload",
        destination: "/app?upload=1",
        permanent: false,
      },
      {
        source: "/app/search",
        destination: "/app",
        permanent: false,
      },
    ];
  },
  // Image optimization configuration
  images: {
    // QA-only: map the reserved seed host to local files so qa-seed fixtures
    // render without weakening the blob_url CHECK constraints. Inert without
    // the explicit non-production QA deployment allowlist.
    ...(isQaLocalAuthEnabled()
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
    // Cost-safe optimization settings (ADR-008). The grid serves thumbnails
    // unoptimized; these govern the optimized detail/landing surfaces only.
    formats: [...IMAGE_FORMATS],
    deviceSizes: IMAGE_DEVICE_SIZES,
    imageSizes: IMAGE_IMAGE_SIZES,
    // Optimized meme variants are immutable — cache long to cut cache-write churn.
    minimumCacheTTL: IMAGE_MINIMUM_CACHE_TTL,
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
