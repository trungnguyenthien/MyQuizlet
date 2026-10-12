/**
 * MyQuizlet - Service Worker (Offline-First PWA)
 * Cache-first strategy for precached assets, stale-while-revalidate for index.html,
 * navigation fallback, clean activation, and skipWaiting handling.
 */

const CACHE_NAME = 'mq-static-v13';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './favicon.ico',
  './manifest.webmanifest',
  './css/app.css',
  './css/app.css?v=9',
  './vendor/github.min.css',
  './vendor/marked.min.js',
  './vendor/purify.min.js',
  './vendor/highlight.min.js',
  './vendor/highlight-swift.min.js',
  './vendor/highlight-kotlin.min.js',
  './vendor/highlight-dart.min.js',
  './js/app.js',
  './js/app.js?v=9',
  './js/main.js',
  './js/store.js',
  './js/parser.js',
  './js/serializer.js',
  './js/render.js',
  './js/study.js',
  './js/gestures.js',
  './js/ui.js',
  './js/i18n.js',
  './icons/favicon-32.png',
  './icons/favicon-32.png?v=3',
  './icons/icon-192.png',
  './icons/icon-192.png?v=3',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/apple-touch-icon.png?v=3',
  './samples/sample.md'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Navigation requests: Stale-While-Revalidate with cached index.html fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match('./index.html') || caches.match('./');
        })
    );
    return;
  }

  // Same-origin static asset requests: Cache-First
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
