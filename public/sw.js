// LottoTrack Pro - Service Worker for PWA Installability
const CACHE_NAME = 'lottotrack-pro-v4';

// Install: activate immediately
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate: clean up ALL old caches immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Fetch: Always bypass service worker cache for local development, localhost & localtunnel
self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes(':5173') || url.includes('/src/') || url.includes('loca.lt')) {
    // Direct network pass-through for development and live tunnel
    return;
  }

  // Production offline fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
