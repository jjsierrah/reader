const CACHE_NAME = 'ebook-reader-v1';
const urlsToCache = [
  '/',
  '/reader/',
  '/reader/index.html',
  '/reader/styles.css',
  '/reader/app.js',
  '/reader/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
