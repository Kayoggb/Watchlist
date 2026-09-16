const CACHE_NAME = 'film-tracker-v1';
const APP_SHELL = [
  '/index.html',
  '/login.html',
  '/movie.html',
  '/person.html',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API-Aufrufe nie cachen: immer aktuelle/eigene Daten vom Server
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  // Network-first fuer den App-Shell, damit Updates sofort ankommen,
  // mit Cache-Fallback fuer schlechte/keine Verbindung.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
