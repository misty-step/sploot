import type { NextConfig } from "next";
import { resolve } from "node:path";
import withPWA from "@ducanh2912/next-pwa";
import {
  IMAGE_DEVICE_SIZES,
  IMAGE_IMAGE_SIZES,
  IMAGE_FORMATS,
  IMAGE_MINIMUM_CACHE_TTL,
} from "./lib/image-config";
import { assertPublicTruthE2EBuildAllowed, isPublicTruthE2EBuild } from "./lib/public-truth-e2e";

assertPublicTruthE2EBuildAllowed(process.env);
const publicTruthE2EBuild = isPublicTruthE2EBuild(process.env);
const QA_BUILD_PUBLISHABLE_KEY = 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k';
const qaEvidenceBuildSafe = !process.env.CLERK_SECRET_KEY &&
  (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === QA_BUILD_PUBLISHABLE_KEY);

// The qa-local auth harness is a build-time capability, not just a runtime
// flag: only explicit dev/test deployments may compile the seam in at all.
// Production/staging builds inline 'false', so webpack dead-code-eliminates
// every qa-local import and marker out of the shipped artifact (the
// production public-truth guard proves the omission on each CI run).
const qaLocalDeployment =
  process.env.SPLOOT_DEPLOYMENT_ENV === 'development' || process.env.SPLOOT_DEPLOYMENT_ENV === 'test';
if (process.env.SPLOOT_QA_AUTH_MODE === 'enabled' && !qaLocalDeployment) {
  throw new Error('SPLOOT_QA_AUTH_MODE=enabled is dev/test-only and requires SPLOOT_DEPLOYMENT_ENV=development or test');
}
const qaLocalAuthBuild = process.env.SPLOOT_QA_AUTH_MODE === 'enabled' && qaLocalDeployment;

const qaClientModule = resolve(__dirname, qaLocalAuthBuild ? "lib/auth/qa-client.ts" : "lib/auth/qa-client-production.ts");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E: publicTruthE2EBuild ? 'true' : 'false',
    NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD: qaLocalAuthBuild ? 'true' : 'false',
  },
  // The local QA browser loop must not mount Next's dev-tools portal into
  // captured evidence. Production is unaffected because the portal is dev
  // only, while the QA assertion still rejects any accidental mount.
  devIndicators: false,
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // The evidence gate needs a self-contained artifact while the deployed production contract stays source-based.
  ...(process.env.SPLOOT_QA_AUTH_MODE === 'enabled' &&
    process.env.SPLOOT_QA_EVIDENCE_MODE === 'enabled' &&
    process.env.SPLOOT_QA_DEPLOYMENT_ID === 'sploot-gallery-qa-local' &&
    process.env.SPLOOT_QA_DEPLOYMENT_AUDIENCE === 'sploot-gallery-evidence' &&
    process.env.DEPLOYMENT_ENV === 'qa-local' &&
    qaEvidenceBuildSafe
    ? { output: 'standalone' }
    : {}),
  webpack(config) {
    const middlewareRuntime = resolve(__dirname, qaLocalAuthBuild ? 'middleware-runtime-qa.ts' : 'middleware-runtime.ts');
    config.resolve.alias = {
      ...config.resolve.alias,
      "@/lib/auth/qa-client": qaClientModule,
      "@/lib/auth/qa-evidence": resolve(__dirname, qaLocalAuthBuild ? "lib/auth/qa-evidence.ts" : "lib/auth/qa-evidence-production.ts"),
      "@/lib/auth/qa-request-auth": resolve(__dirname, qaLocalAuthBuild ? "lib/auth/qa-request-auth.ts" : "lib/auth/qa-request-auth-production.ts"),
      "@/lib/auth/qa-server": resolve(__dirname, qaLocalAuthBuild ? "lib/auth/qa-server.ts" : "lib/auth/qa-server-production.ts"),
      '@/middleware-runtime$': middlewareRuntime,
    };
    return config;
  },
  // @ffmpeg-installer resolves its platform binary with dynamic requires that
  // Turbopack cannot bundle — without this, `next dev` fails to compile
  // /api/upload (HTTP 500 for every upload, incl. the Chrome extension's
  // localhost dev flow). Keep it a runtime node_modules require.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
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
    // render without weakening the blob_url CHECK constraints. Inert unless
    // every explicit non-production evidence marker is present.
    ...(process.env.SPLOOT_QA_AUTH_MODE === 'enabled' &&
      process.env.SPLOOT_QA_EVIDENCE_MODE === 'enabled' &&
      process.env.SPLOOT_QA_DEPLOYMENT_ID === 'sploot-gallery-qa-local' &&
      process.env.SPLOOT_QA_DEPLOYMENT_AUDIENCE === 'sploot-gallery-evidence' &&
      process.env.DEPLOYMENT_ENV === 'qa-local' &&
      qaEvidenceBuildSafe
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
      // Protected documents must always cross the auth boundary. A URL
      // predicate is required here because Workbox evaluates runtime routes
      // against absolute request URLs, not path-only strings.
      {
        urlPattern: ({ request, url }) => request.mode === 'navigate' && (url.pathname === '/app' || url.pathname.startsWith('/app/')),
        handler: 'NetworkOnly',
      },
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
