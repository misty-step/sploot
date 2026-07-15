import type { Metadata } from "next";
import { Bungee, Space_Mono, Baloo_2 } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/client";
import { getAuth } from "@/lib/auth/server";
import { Toaster } from "@/components/ui/toast";
import { EmbeddingStatusProvider } from "@/contexts/embedding-status-context";
import { ThemeProvider } from "@/components/theme-provider";
import {
  PRODUCT_DESCRIPTION,
  PRODUCT_NAME,
  PRODUCT_THEME_COLOR,
  PRODUCT_URL,
} from "@/lib/product";

// Toybox type (lab-034, AFD-8 "ink minis"): Baloo 2 for the rounded friendly
// body, Space Mono for machine labels/stats/meta, Bungee for toy display
// headlines. The next/font `variable` names are kept stable (the old --font-*
// slots) so existing consumers that reference them directly keep resolving —
// only the font behind each slot moves to the toybox family.
const baloo = Baloo_2({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const bungee = Bungee({
  variable: "--font-bebas-neue",
  subsets: ["latin"],
  weight: ["400"],
});

const spaceMono = Space_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCT_URL),
  title: PRODUCT_NAME,
  description: PRODUCT_DESCRIPTION,
  keywords: ["meme", "library", "search", "semantic", "image"],
  authors: [{ name: "Sploot" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sploot",
    startupImage: [
      {
        url: "/splash/apple-splash-2048-2732.jpg",
        media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/splash/apple-splash-1668-2388.jpg",
        media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/splash/apple-splash-1536-2048.jpg",
        media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/splash/apple-splash-1125-2436.jpg",
        media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/splash/apple-splash-1242-2208.jpg",
        media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/splash/apple-splash-750-1334.jpg",
        media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/splash/apple-splash-640-1136.jpg",
        media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
    ],
  },
  openGraph: {
    title: PRODUCT_NAME,
    description: PRODUCT_DESCRIPTION,
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: PRODUCT_DESCRIPTION,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT_NAME,
    description: PRODUCT_DESCRIPTION,
    images: ["/og-image.png"],
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "application-name": PRODUCT_NAME,
    "apple-mobile-web-app-title": PRODUCT_NAME,
    "msapplication-TileColor": PRODUCT_THEME_COLOR,
    "msapplication-config": "/browserconfig.xml",
  },
};

export const viewport = {
  themeColor: PRODUCT_THEME_COLOR,
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The local Chromium seam uses the same verified QA principal on the
  // server and client so durable queue ownership cannot collapse accounts.
  // Normal Clerk deployments do not read this branch.
  let qaUserId: string | null | undefined;
  if (process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_MODE === 'enabled' &&
      process.env.NEXT_PUBLIC_SPLOOT_PWA_CAPTURE_MODE === 'enabled') {
    try {
      qaUserId = (await getAuth()).userId;
    } catch {
      // Unauthenticated public routes still render through the normal Clerk
      // path; only a verified QA request receives a client owner identity.
      qaUserId = undefined;
    }
  }

  return (
    <AuthProvider qaUserId={qaUserId}>
      <EmbeddingStatusProvider>
        <html lang="en" suppressHydrationWarning>
          <head>
            <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
            <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
            <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
            <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color={PRODUCT_THEME_COLOR} />
            <meta name="theme-color" content={PRODUCT_THEME_COLOR} />
          </head>
          <body
            className={`${baloo.variable} ${bungee.variable} ${spaceMono.variable} font-sans antialiased`}
          >
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              {children}
              <Toaster />
            </ThemeProvider>
          </body>
        </html>
      </EmbeddingStatusProvider>
    </AuthProvider>
  );
}
