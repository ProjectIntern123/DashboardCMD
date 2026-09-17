const CACHE_NAME = 'hartek-cmd-pwa-v4';

const STATIC_PRECACHE = [
  '/',
  '/login',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
  '/icons/apple-touch-icon.png',
];

// Install Event - Pre-cache static shell resiliently
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_PRECACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[PWA SW] Pre-cache skipped for asset:', url, err.message);
          })
        )
      );
    })
  );
});

// Activate Event - Clean up stale caches safely
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Message Event - Allow controlled client updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch Event - Strict Precision Routing
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. STRICT NETWORK ONLY: Never cache API, Auth, Manifest, PWA Assets, or Dynamic Settings
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.includes('/auth/') ||
    url.pathname.includes('/settings') ||
    url.pathname.includes('/users') ||
    url.pathname.includes('/manifest') ||
    url.pathname.includes('/pwa-icon') ||
    url.pathname.includes('/pwa-assets') ||
    url.pathname.includes('/audit-logs') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // 2. Static Immutable Assets (_next/static, icons, static files) - Cache First
  if (
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.ico')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. Page Navigation (HTML) - Network First with Offline Cache Fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return caches.match('/');
          });
        })
    );
  }
});
