const SHELL_CACHE = 'faariz-invitation-shell-v9';
const RUNTIME_CACHE = 'faariz-invitation-runtime-v9';
const CACHE_PREFIX = 'faariz-invitation-';
const MAX_RUNTIME_ENTRIES = 48;

// Keep installation small. The full gallery is cached only as visitors open its images.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/faariz-pwa-192.png',
  './assets/icons/faariz-pwa-512.png',
  './assets/icons/faariz-pwa-maskable-512.png',
  './assets/icons/faariz-apple-touch-icon.png',
  './assets/photos/faariz-hero.jpg',
  './assets/photos/faariz-profile.jpg',
  './assets/photos/social-share-faariz.jpg'
];

const scopeUrl = new URL(self.registration.scope);
const generatorPath = new URL('./generator/', scopeUrl).pathname;
const legacyGeneratorPath = new URL('./generator-tamu.html', scopeUrl).pathname;

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

async function trimRuntimeCache(cache) {
  const keys = await cache.keys();
  const staleKeys = keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME_ENTRIES));
  await Promise.all(staleKeys.map(key => cache.delete(key)));
}

async function putRuntime(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return;
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
    await trimRuntimeCache(cache);
  } catch (_) {
    // A full browser cache must never prevent the invitation from loading online.
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

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then(async response => {
      await putRuntime(request, response);
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  return (await network) || Response.error();
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Generator Tamu is a separate PWA and gets its own service worker/cache.
  if (url.pathname.startsWith(generatorPath) || url.pathname === legacyGeneratorPath) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('./index.html')) || Response.error())
    );
    return;
  }

  // Audio remains network-only to keep the installation and runtime cache lightweight.
  if (/\.(?:mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(url.pathname)) return;

  if (/\.(?:png|jpe?g|webp|svg|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
