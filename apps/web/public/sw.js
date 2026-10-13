const SHELL_CACHE = 'nudge-shell-v1';
const STATIC_CACHE = 'nudge-static-v1';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function (cache) {
        return cache.addAll(['/', '/icon-192.png', '/apple-touch-icon.png']);
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== SHELL_CACHE && key !== STATIC_CACHE;
            })
            .map(function (key) {
              return caches.delete(key);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // The API is cross-origin and its data must never be served stale.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network-first for HTML so users never see a stale shell; cache is the offline fallback.
    event.respondWith(
      fetch(request)
        .then(function (response) {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(function (cache) {
            cache.put(request, copy);
          });
          return response;
        })
        .catch(async function () {
          const cached =
            (await caches.match(request)) ||
            (await caches.match(url.pathname.replace(/\/[^/]*$/, '/index.html'))) ||
            (await caches.match('/'));
          return (
            cached ||
            new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        }),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || /\.(?:png|svg|jpg|jpeg|woff2?)$/.test(url.pathname)) {
    // Hashed build assets and icons are immutable: cache-first.
    event.respondWith(
      caches.open(STATIC_CACHE).then(async function (cache) {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});

self.addEventListener('push', function (event) {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'Nudge Notification';
    const options = {
      body: data.body || 'You have new actionable events to review.',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: {
        url: data.url || '/dashboard',
      },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('Error in push event handler:', err);
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (windowClients) {
        for (let client of windowClients) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      }),
  );
});
