const CACHE_VERSION = 'flexcrm-v1';
const STATIC_CACHE = `flexcrm-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `flexcrm-runtime-${CACHE_VERSION}`;

// Precache app shell on install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll([
        '/app/',
        '/app/index.html',
        '/app/login',
        '/admin/',
        '/admin/index.html',
        '/landing.html',
        '/gracias.html',
        '/manifest.json',
        '/offline.html',
      ]);
    })
  );
  self.skipWaiting();
});

// Clean old caches on activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isAPI = url.pathname.startsWith('/api/');
  const isStatic = url.pathname.startsWith('/app/assets/') ||
    /\.(js|css|woff2?|png|svg|ico|json)$/.test(url.pathname);

  // API calls: network only (handled by offline queue)
  if (isAPI) return;

  // Static assets: cache first, network update in background
  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetched = fetch(event.request).then(response => {
          const cloned = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(event.request, cloned));
          return response;
        });
        return cached || fetched;
      })
    );
    return;
  }

  // HTML / navigation: network first, offline fallback
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request).then(cached => {
          return cached || caches.match('/offline.html');
        });
      })
    );
    return;
  }

  // Everything else: network first, cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
