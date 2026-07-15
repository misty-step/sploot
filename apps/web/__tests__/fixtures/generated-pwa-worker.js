/*
 * Representative next-pwa output used only to exercise the source-level
 * validator in the test job. CI validates the real generated public/sw.js
 * after the production build, so this fixture cannot satisfy the ship gate.
 */
self.skipWaiting();
clientsClaim();
precacheAndRoute([{ url: '/manifest.json', revision: 'fixture' }]);
registerRoute(/blob/, new CacheFirst({ cacheName: 'user-images' }));
registerRoute(/api\/search/, new StaleWhileRevalidate({ cacheName: 'api-search' }));
