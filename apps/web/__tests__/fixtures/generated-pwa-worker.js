/*
 * Representative next-pwa output used only to exercise the source-level
 * validator in the test job. CI validates the real generated public/sw.js
 * after the production build, so this fixture cannot satisfy the ship gate.
 */
self.skipWaiting();
const workbox = { precacheAndRoute, clientsClaim, registerRoute, NetworkOnly, CacheFirst, StaleWhileRevalidate };
workbox.clientsClaim();
workbox.precacheAndRoute([{ url: '/manifest.json', revision: 'fixture' }], { ignoreURLParametersMatching: [/^utm_/i] });
workbox.registerRoute(({ request, url }) => request.mode === 'navigate' && (url.pathname === '/app' || url.pathname.startsWith('/app/')), new workbox.NetworkOnly(), 'GET');
workbox.registerRoute(/blob/, new workbox.CacheFirst({ cacheName: 'user-images' }), 'GET');
workbox.registerRoute(/api\/search/, new workbox.StaleWhileRevalidate({ cacheName: 'api-search' }), 'GET');
