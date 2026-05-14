// Kill switch: replaces the old service worker from the CheerpX phase.
// Self-unregisters and clears all caches so the page loads cleanly.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll();
    for (const c of clients) c.navigate(c.url);
  })());
});
