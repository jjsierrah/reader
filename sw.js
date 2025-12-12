const CACHE_NAME = 'ebook-reader-v1';
const urlsToCache = [
  '/reader/',
  '/reader/index.html',
  '/reader/styles.css',
  '/reader/app.js',
  '/reader/dexie.js',
  '/reader/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
