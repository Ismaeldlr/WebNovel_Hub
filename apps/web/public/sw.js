// Webnovel Hub has no service worker any more: offline reading is gone. Devices
// that installed the old one check this address for updates. This version takes over at
// once, deletes everything the old one saved, unregisters itself and reloads its pages,
// which then come from the server again. Nothing registers it; keep it until no device
// can still have the old worker.
self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      await self.registration.unregister();
      const pages = await self.clients.matchAll({ type: 'window' });
      await Promise.all(pages.map((page) => page.navigate(page.url)));
    })(),
  );
});
