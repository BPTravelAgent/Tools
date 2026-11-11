const CACHE_NAME = 'bp-tools-v39';

const ASSETS_TO_CACHE = [
  '.',
  './index.html',
  './tour_costing.html',
  './slw_excel_generator.js?v=39',
  './js/costing/costing_state.js?v=39',
  './js/costing/costing_master_db.js?v=39',
  './js/costing/costing_ui.js?v=39',
  './js/costing/costing_itinerary_sync.js?v=39',
  './js/costing/costing_calculator.js?v=39',
  './js/costing/costing_presets.js?v=39',
  './js/costing/costing_inq_hub.js?v=39',
  './js/costing/costing_sheets.js?v=39',
  './js/costing/costing_init.js?v=39',
  './Domarco_Itinerary.html',
  './Evago_Smart_Itinerary.html',
  './archives/Itinerary_Builder_App New.html',
  './archives/html2canvas.min.js',
  './archives/jspdf.umd.min.js',
  './Dp/Image.png',
  './team_chat.css',
  './team_chat.js',
  './auth_security.js'
];

// Install event: cache basic assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((error) => {
        console.error('Caching failed:', error);
      });
    })
  );
  self.skipWaiting();
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event: Network-first strategy (bypass HTTP disk cache for same-origin app assets)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const reqUrl = new URL(event.request.url);
  const fetchPromise = reqUrl.origin === self.location.origin
    ? fetch(event.request.url, { cache: 'no-cache', credentials: event.request.credentials })
    : fetch(event.request);
  event.respondWith(
    fetchPromise
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Notification click event: focus existing tab or open index.html
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});
