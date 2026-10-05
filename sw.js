/**
 * sw.js — Service Worker
 * 本站檔案：Network First（線上永遠拿最新版，離線回退快取）
 * CDN 檔案：Cache First（版本號寫在網址內，內容不變）
 */

const CACHE_NAME = 'weight-tracker-v11';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/chart-render.js',
  './js/export.js',
  './js/app.js',
  './js/vendor/xlsx.full.min.js',
  './manifest.json',
  './icons/favicon.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function putInCache(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  const clone = response.clone();
  caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const sameOrigin = new URL(event.request.url).origin === self.location.origin;

  if (sameOrigin) {
    // Network First
    event.respondWith(
      fetch(event.request)
        .then(response => { putInCache(event.request, response); return response; })
        .catch(() =>
          caches.match(event.request, { ignoreSearch: true })
            .then(cached => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Cache First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        putInCache(event.request, response);
        return response;
      });
    })
  );
});
