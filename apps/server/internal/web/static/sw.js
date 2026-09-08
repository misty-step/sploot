"use strict";

self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  // Retire only Sploot's previous response caches. IndexedDB contains unconfirmed
  // user captures and must never be deleted as part of an application upgrade.
  const names = await caches.keys();
  await Promise.all(names.filter(name => name === "user-images" || name === "api-search" || name.startsWith("workbox-precache-")).map(name => caches.delete(name)));
  await self.clients.claim();
})()));

// Protected pages, search and media always cross the live authentication boundary.
// Transfer durability belongs to the existing account-partitioned IndexedDB queue.
