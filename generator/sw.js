const SHELL_CACHE = 'faariz-generator-shell-v4';
const RUNTIME_CACHE = 'faariz-generator-runtime-v4';
const CACHE_PREFIX = 'faariz-generator-';
const MAX_RUNTIME_ENTRIES = 16;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/generator-pwa-192.png',
  './icons/generator-pwa-512.png',
  './icons/generator-apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function putRuntime(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return;
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME_ENTRIES)).map(key => cache.delete(key)));
  } catch (_) {
    // Storage pressure must not break the generator while it is online.
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    await putRuntime(request, response);
    return response;
  } catch (_) {
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('./index.html')) || Response.error())
    );
    return;
  }

  event.respondWith(cacheFirst(request));
});
