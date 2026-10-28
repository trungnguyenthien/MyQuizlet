/**
 * MyQuizlet - Service Worker (Offline-First PWA)
 * Strict scope isolation for GitHub Pages subpath hosting, safe protocol skipping,
 * cache-first strategy with ignoreSearch, stale-while-revalidate navigation fallback,
 * clean activation, and controlled in-app skipWaiting updates.
 */

const CACHE_NAME = 'mq-static-v31';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './index.html?v=27',
  './favicon.ico',
  './favicon.ico?v=4',
  './manifest.webmanifest',
  './manifest.webmanifest?v=27',
  './css/app.css',
  './css/app.css?v=27',
  './vendor/github.min.css',
  './vendor/marked.min.js',
  './vendor/purify.min.js',
  './vendor/highlight.min.js',
  './vendor/highlight-swift.min.js',
  './vendor/highlight-kotlin.min.js',
  './vendor/highlight-dart.min.js',
  './js/app.js',
  './js/app.js?v=27',
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
  './icons/favicon-32.png?v=4',
  './icons/icon-192.png',
  './icons/icon-192.png?v=4',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/apple-touch-icon.png?v=4',
  './samples/sample.md'
];

self.addEventListener('install', (event) => {
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
  // 1. Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 2. Ignore non-http/https protocols (chrome-extension, blob, data)
  if (url.protocol.startsWith('chrome-extension') || url.protocol === 'blob:' || url.protocol === 'data:') {
    return;
  }

  // 3. Service Worker Scope Isolation: do not intercept requests outside app scope
  if (url.origin === self.location.origin && !event.request.url.startsWith(self.registration.scope)) {
    return;
  }

  // 4. Navigation requests: Stale-While-Revalidate with cached index.html fallback
  if (event.request.mode === 'navigate') {
    if (!event.request.url.startsWith(self.registration.scope)) {
      return;
    }

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
          return caches.match('./index.html', { ignoreSearch: true }) || caches.match('./', { ignoreSearch: true });
        })
    );
    return;
  }

  // 5. Same-origin static asset requests: Cache-First with ignoreSearch
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
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
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data.action === 'skipWaiting')) {
    self.skipWaiting();
  }
});
