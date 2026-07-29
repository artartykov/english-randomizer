/* Service worker: keeps the app usable offline. Bump CACHE when assets change. */
var CACHE = 'word-randomizer-v3';

var PRECACHE = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'words.txt',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/favicon-64.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // `cache: 'reload'` keeps the browser's own HTTP cache out of the
      // precache. Assets are served with a week-long lifetime, so a plain
      // addAll() is allowed to satisfy itself from a copy cached before the
      // deploy — filling the new cache with the old build, which then survives
      // every reload because only a CACHE bump can dislodge it.
      return cache.addAll(PRECACHE.map(function (url) {
        return new Request(url, { cache: 'reload' });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE ? null : caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Network-first for navigations so a redeploy is picked up on the next
  // online visit, with the cached shell standing in when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) {
          cache.put('index.html', copy);
        });
        return response;
      }).catch(function () {
        return caches.match('index.html');
      })
    );
    return;
  }

  // Cache-first for everything else: the dictionary and shell rarely change.
  event.respondWith(
    caches.match(request).then(function (cached) {
      return cached || fetch(request).then(function (response) {
        if (response.ok) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      });
    })
  );
});
