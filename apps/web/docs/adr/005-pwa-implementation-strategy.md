# ADR-005: PWA Implementation Strategy

**Status:** Proposed
**Date:** 2024-09-13
**Deciders:** Development Team
**Technical Story:** Sploot requires PWA capabilities for installable, offline-capable meme library experience

## Context

Sploot must function as a Progressive Web App to provide native app-like experience for personal meme library management. Key requirements include:

- **Cross-platform installation:** iOS, Android, macOS, Windows, Linux
- **Offline functionality:** Browse cached memes when network unavailable
- **Background sync:** Resume failed uploads when connection restored
- **Push notifications:** Optional for upload completion status
- **Native integration:** Share target for receiving images from other apps

### Requirements Analysis

**User Experience Requirements:**
- One-tap installation from browser
- Native app appearance in OS launchers and task switchers
- Offline browsing of previously loaded content
- Seamless transition between online and offline states
- Fast startup times (<1s to interactive)

**Technical Requirements:**
- Next.js App Router compatibility
- Service Worker integration with client-side routing
- Background sync for upload recovery
- Efficient caching strategy for assets and data
- Cross-platform icon and splash screen support

**Performance Requirements:**
- App shell cache: <500KB total size
- Offline page loads: <200ms from cache
- Background sync: Resume within 30s of reconnection
- Storage efficiency: <50MB for typical usage patterns

## Decision

We will implement a **Network-First PWA with Intelligent Caching** strategy using Next.js built-in PWA capabilities enhanced with custom service worker logic.

**Architecture:**
- **Service Worker:** Custom implementation with Workbox for advanced caching
- **Caching Strategy:** Network-first for dynamic content, cache-first for assets
- **Offline Support:** Cached shell + graceful degradation for uncached content
- **Background Sync:** Queue failed uploads and API calls for retry on reconnection
- **Installation:** Standard Web App Manifest with platform-specific optimizations

**Implementation Approach:**
```
App Shell (Cached) → Dynamic Content (Network-First) → Fallback (Cached)
                  ↓
Background Sync Queue → Retry on Connection Restore
```

## Consequences

### Positive

- **Native-like experience:** Feels like installed native app across all platforms
- **Offline resilience:** Core functionality available without network connection
- **Enhanced performance:** Cached resources load instantly
- **User engagement:** App icon on home screen increases usage frequency
- **Cross-platform reach:** Single codebase works on all major platforms

### Negative

- **Complexity:** Service Worker lifecycle management and debugging challenges
- **Storage management:** Need to implement cache cleanup and storage quota handling
- **iOS limitations:** Some PWA features limited on iOS Safari
- **Update challenges:** Service Worker updates require careful user experience design
- **Testing overhead:** Must test offline scenarios and various network conditions

## Alternatives Considered

### 1. Native Mobile Apps (React Native/Flutter)

**Pros:**
- Full native platform integration
- Better performance on mobile devices
- Complete offline capabilities
- App store distribution and discovery

**Cons:**
- Multiple codebases to maintain
- App store approval processes and policies
- Higher development and maintenance costs
- Desktop platform requires separate solutions

**Verdict:** Rejected due to maintenance overhead and Vercel-first architecture.

### 2. Electron Desktop App

**Pros:**
- True native desktop experience
- Full filesystem access and integration
- No browser compatibility concerns
- Advanced offline capabilities

**Cons:**
- Large bundle size (>100MB)
- High memory usage
- No mobile platform support
- Separate deployment and update mechanisms

**Verdict:** Rejected in favor of unified web-based approach.

### 3. Basic Web App (No PWA features)

**Pros:**
- Simpler implementation without service worker complexity
- No cache management or offline state handling
- Standard web development practices only

**Cons:**
- No installation capability
- Poor offline experience
- No background sync for uploads
- Less native-like user experience

**Verdict:** Rejected due to user experience requirements in PRD.

### 4. Hybrid PWA (PWA + Cordova wrapper)

**Pros:**
- PWA benefits with enhanced native capabilities
- Bridge to native features not available in web
- App store distribution option

**Cons:**
- Additional wrapper complexity
- Larger bundle size and slower startup
- Platform-specific wrapper maintenance
- Performance overhead from bridge layer

**Verdict:** Rejected due to added complexity vs. benefit ratio.

## Trade-offs

### Performance vs. Offline Capability
- **Chosen:** Comprehensive caching with larger initial download but excellent offline experience
- **Alternative:** Minimal caching with faster initial load but limited offline functionality

### Complexity vs. User Experience
- **Chosen:** Service Worker complexity for native-like app experience
- **Alternative:** Simple web app with standard browser experience

### Storage Usage vs. Functionality
- **Chosen:** Intelligent caching with storage management for rich offline features
- **Alternative:** Minimal storage usage with online-only functionality

## Implementation Strategy

### Phase 1: Basic PWA Foundation
```typescript
// next.config.js - PWA configuration
const withPWA = require('next-pwa')({
  dest: 'public',
  register: false, // Custom service worker registration
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development'
})

module.exports = withPWA({
  // Next.js config
})
```

```json
// public/manifest.json - Web App Manifest
{
  "name": "Sploot - Meme Library",
  "short_name": "Sploot",
  "description": "Private meme library with semantic search",
  "start_url": "/app",
  "display": "standalone",
  "background_color": "#0B0C0E",
  "theme_color": "#7C5CFF",
  "orientation": "any",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "categories": ["photo", "utilities", "productivity"],
  "shortcuts": [
    {
      "name": "Upload Image",
      "short_name": "Upload",
      "url": "/app/upload",
      "icons": [{ "src": "/icons/upload-96x96.png", "sizes": "96x96" }]
    },
    {
      "name": "Search",
      "short_name": "Search",
      "url": "/app?focus=search",
      "icons": [{ "src": "/icons/search-96x96.png", "sizes": "96x96" }]
    }
  ]
}
```

### Phase 2: Custom Service Worker with Intelligent Caching
```typescript
// public/sw.js - Custom service worker
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies'
import { BackgroundSync } from 'workbox-background-sync'

// Precache app shell
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// App shell - cache first
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new StaleWhileRevalidate({
    cacheName: 'app-shell',
    plugins: [{
      cacheKeyWillBeUsed: async ({ request }) => {
        return new URL('/app', self.location).href
      }
    }]
  })
)

// API routes - network first with background sync fallback
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10,
    plugins: [{
      cacheWillUpdate: async ({ response }) => {
        return response.status === 200 ? response : null
      }
    }]
  })
)

// Images - cache first with expiration
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [{
      cacheExpiration: {
        maxEntries: 1000,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 1 week
        purgeOnQuotaError: true
      }
    }]
  })
)

// Background sync for failed uploads
const bgSync = new BackgroundSync('upload-queue', {
  maxRetentionTime: 24 * 60 // 24 hours
})

registerRoute(
  ({ url }) => url.pathname === '/api/assets',
  new NetworkFirst({
    plugins: [bgSync.replayPlugin]
  }),
  'POST'
)
```

### Phase 3: Background Sync and Queue Management
```typescript
// lib/background-sync.ts - Upload queue management
interface QueuedUpload {
  id: string
  file: File
  metadata: UploadMetadata
  timestamp: number
  retryCount: number
}

class UploadQueue {
  private queue: QueuedUpload[] = []
  private isProcessing = false

  async addToQueue(file: File, metadata: UploadMetadata): Promise<string> {
    const upload: QueuedUpload = {
      id: crypto.randomUUID(),
      file,
      metadata,
      timestamp: Date.now(),
      retryCount: 0
    }

    this.queue.push(upload)
    this.persistQueue()
    this.processQueue()

    return upload.id
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return

    this.isProcessing = true

    while (this.queue.length > 0) {
      const upload = this.queue[0]

      try {
        await this.processUpload(upload)
        this.queue.shift() // Remove successful upload
        this.persistQueue()
      } catch (error) {
        upload.retryCount++

        if (upload.retryCount >= 3) {
          this.queue.shift() // Remove failed upload after 3 retries
          this.notifyUploadFailed(upload)
        } else {
          // Move to end of queue for retry
          this.queue.push(this.queue.shift()!)
        }

        this.persistQueue()

        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, 1000 * upload.retryCount))
      }
    }

    this.isProcessing = false
  }

  private async processUpload(upload: QueuedUpload): Promise<void> {
    const formData = new FormData()
    formData.append('file', upload.file)
    Object.entries(upload.metadata).forEach(([key, value]) => {
      formData.append(key, value)
    })

    const response = await fetch('/api/assets', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }
  }

  private persistQueue(): void {
    localStorage.setItem('upload-queue', JSON.stringify(
      this.queue.map(upload => ({
        ...upload,
        file: null // Don't persist file objects
      }))
    ))
  }

  private notifyUploadFailed(upload: QueuedUpload): void {
    self.registration.showNotification('Upload Failed', {
      body: `Failed to upload ${upload.file.name} after 3 attempts`,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png'
    })
  }
}
```

### Phase 4: Installation and Update Management
```typescript
// components/InstallPrompt.tsx - PWA installation UI
'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      setInstallPrompt(e)
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener)
    }
  }, [])

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice

      if (choice.outcome === 'accepted') {
        setShowPrompt(false)
        setInstallPrompt(null)
      }
    }
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-surface p-4 rounded-lg border border-border">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-text">Install Sploot</h3>
          <p className="text-sm text-mutedText">Get quick access to your meme library</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPrompt(false)}
            className="px-3 py-2 text-sm text-mutedText hover:text-text"
          >
            Later
          </button>
          <button
            onClick={handleInstall}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  )
}
```

## Offline Strategy

### App Shell Architecture
```typescript
// App shell components always cached
const APP_SHELL = {
  layout: '/app/layout',
  navigation: '/app/navigation',
  searchBar: '/app/search-bar',
  uploadZone: '/app/upload-zone',
  offlinePage: '/offline'
}

// Offline fallback for dynamic content
const OfflinePage = () => (
  <div className="flex flex-col items-center justify-center min-h-screen p-4">
    <div className="text-center">
      <h1 className="text-2xl font-bold mb-4">You're offline</h1>
      <p className="text-mutedText mb-6">
        Some content isn't available offline, but you can still browse cached memes.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="bg-accent text-white px-6 py-3 rounded-lg font-medium"
      >
        Try again
      </button>
    </div>
  </div>
)
```

### Intelligent Caching Decisions
```typescript
// Cache priority system
const CACHE_PRIORITIES = {
  CRITICAL: ['/', '/app', '/manifest.json', '/icons/*'],
  HIGH: ['/api/search', 'frequently-viewed-images'],
  MEDIUM: ['/api/assets', 'recent-search-results'],
  LOW: ['large-images', 'infrequent-content']
}

// Storage quota management
class CacheManager {
  async manageCacheQuota(): Promise<void> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate()
      const usedPercentage = (estimate.usage! / estimate.quota!) * 100

      if (usedPercentage > 80) {
        await this.cleanupLowPriorityCache()
      }
    }
  }

  private async cleanupLowPriorityCache(): Promise<void> {
    const cache = await caches.open('images')
    const keys = await cache.keys()

    // Remove oldest 25% of cached images
    const sortedKeys = keys.sort((a, b) =>
      this.getCacheTimestamp(a) - this.getCacheTimestamp(b)
    )

    const keysToDelete = sortedKeys.slice(0, Math.floor(keys.length * 0.25))
    await Promise.all(keysToDelete.map(key => cache.delete(key)))
  }

  private getCacheTimestamp(request: Request): number {
    // Extract timestamp from cache metadata or use current time
    return Date.now()
  }
}
```

## Performance Optimization

### Service Worker Optimization
```typescript
// Efficient service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js')

      // Handle service worker updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing

        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateAvailablePrompt()
          }
        })
      })
    } catch (error) {
      console.error('Service worker registration failed:', error)
    }
  })
}

function showUpdateAvailablePrompt() {
  // Show user-friendly update prompt
  const updateBanner = document.createElement('div')
  updateBanner.innerHTML = `
    <div class="update-banner">
      <span>New version available</span>
      <button onclick="location.reload()">Update</button>
    </div>
  `
  document.body.appendChild(updateBanner)
}
```

### Preloading Strategy
```typescript
// Intelligent preloading based on user behavior
class PreloadManager {
  private userBehavior = {
    frequentSearches: [] as string[],
    recentImages: [] as string[],
    favoriteImages: [] as string[]
  }

  async preloadCriticalResources(): Promise<void> {
    // Preload user's favorite images
    await Promise.all(
      this.userBehavior.favoriteImages.slice(0, 10).map(url =>
        this.preloadImage(url)
      )
    )

    // Preload frequent search embeddings
    await Promise.all(
      this.userBehavior.frequentSearches.slice(0, 5).map(query =>
        this.preloadSearchEmbedding(query)
      )
    )
  }

  private async preloadImage(url: string): Promise<void> {
    const cache = await caches.open('images')
    await cache.add(url)
  }

  private async preloadSearchEmbedding(query: string): Promise<void> {
    try {
      await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, preload: true })
      })
    } catch (error) {
      // Ignore preload failures
    }
  }
}
```

## Platform-Specific Optimizations

### iOS Safari Optimizations
```html
<!-- iOS-specific meta tags -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Sploot">

<!-- iOS splash screens -->
<link rel="apple-touch-startup-image" href="/icons/splash-2048x2732.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/icons/splash-1668x2388.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">

<!-- iOS icons -->
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152x152.png">
<link rel="apple-touch-icon" sizes="167x167" href="/icons/apple-touch-icon-167x167.png">
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180x180.png">
```

### Android Optimizations
```json
{
  "display_override": ["window-controls-overlay", "minimal-ui"],
  "edge_side_panel": {
    "preferred_width": 400
  },
  "handle_links": "preferred",
  "launch_handler": {
    "client_mode": "focus-existing"
  },
  "protocol_handlers": [
    {
      "protocol": "web+sploot",
      "url": "/app/import?url=%s"
    }
  ]
}
```

## Testing Strategy

### PWA Testing Checklist
```typescript
// Automated PWA testing
describe('PWA Functionality', () => {
  test('Service worker registers successfully', async () => {
    const registration = await navigator.serviceWorker.register('/sw.js')
    expect(registration.scope).toBe('/')
  })

  test('Offline page loads from cache', async () => {
    // Simulate offline
    await page.setOfflineMode(true)
    const response = await page.goto('/app')
    expect(response?.status()).toBe(200)
  })

  test('Background sync queues failed uploads', async () => {
    // Mock failed upload
    await page.route('/api/assets', route => route.abort())

    // Attempt upload
    await page.locator('input[type="file"]').setInputFiles('test-image.jpg')

    // Verify queue persistence
    const queue = await page.evaluate(() =>
      localStorage.getItem('upload-queue')
    )
    expect(JSON.parse(queue)).toHaveLength(1)
  })

  test('Install prompt appears on supported browsers', async () => {
    // Trigger beforeinstallprompt event
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'))
    })

    await expect(page.locator('.install-prompt')).toBeVisible()
  })
})
```

### Manual Testing Protocol
1. **Installation testing:** Verify install flow on iOS, Android, desktop
2. **Offline testing:** Test all major features without network connection
3. **Update testing:** Verify service worker update flow
4. **Background sync:** Test upload recovery after network restoration
5. **Performance testing:** Measure startup times and cache effectiveness

## Monitoring and Analytics

### PWA-Specific Metrics
```typescript
// PWA analytics tracking
class PWAAnalytics {
  trackInstallation() {
    gtag('event', 'pwa_install', {
      event_category: 'engagement',
      event_label: this.getInstallSource()
    })
  }

  trackOfflineUsage() {
    gtag('event', 'offline_usage', {
      event_category: 'engagement',
      value: this.getOfflineDuration()
    })
  }

  trackBackgroundSync() {
    gtag('event', 'background_sync', {
      event_category: 'performance',
      value: this.getQueueLength()
    })
  }

  private getInstallSource(): string {
    return navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop'
  }

  private getOfflineDuration(): number {
    return Date.now() - this.offlineStartTime
  }

  private getQueueLength(): number {
    const queue = localStorage.getItem('upload-queue')
    return queue ? JSON.parse(queue).length : 0
  }
}
```

### Performance Monitoring
```typescript
// Service worker performance metrics
self.addEventListener('message', event => {
  if (event.data.type === 'CACHE_PERFORMANCE') {
    const cacheHitRate = this.calculateCacheHitRate()
    const averageResponseTime = this.calculateAverageResponseTime()

    event.ports[0].postMessage({
      cacheHitRate,
      averageResponseTime,
      cacheSize: this.getCacheSize()
    })
  }
})
```

## Security Considerations

### Service Worker Security
```typescript
// Validate cache requests to prevent cache poisoning
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Only cache same-origin requests
  if (url.origin !== location.origin) {
    return
  }

  // Validate request integrity
  if (!this.isValidRequest(event.request)) {
    return
  }

  event.respondWith(this.handleRequest(event.request))
})
```

### Content Security Policy
```typescript
// CSP for PWA security
const csp = `
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  connect-src 'self' https://api.replicate.com;
  worker-src 'self';
  manifest-src 'self';
`
```

## Future Enhancements

- **Web Share API:** Enable sharing memes from the app
- **File System Access API:** Direct file system integration where supported
- **Web Locks API:** Coordinate between multiple tabs
- **Persistent Storage:** Request persistent storage for critical data
- **Background Fetch:** Long-running download operations

## References

- [Progressive Web Apps Documentation](https://web.dev/progressive-web-apps/)
- [Service Worker API Reference](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Web App Manifest Specification](https://www.w3.org/TR/appmanifest/)
- [Workbox Documentation](https://developers.google.com/web/tools/workbox)
- [PWA Best Practices](https://web.dev/pwa-checklist/)