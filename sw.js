/* MOB RUN cache.
   The big Three.js file stays cached. The game shell prefers the network
   so a refresh picks up changes, and falls back to cache within 1.2s. */
const CACHE = 'mobrun-v10';
const PRECACHE = [
  './',
  './index.html',
  './game3d.js',
  './classic.html',
  './game.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './vendor/three.module.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

function isShell(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  if (path.includes('/vendor/')) return false;
  return path.endsWith('.js') || path.endsWith('.html') || path.endsWith('.webmanifest') || path.endsWith('/');
}

function networkFirst(req) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(async () => {
      if (done) return;
      const hit = await caches.match(req);
      if (hit) { done = true; resolve(hit); }
    }, 1200);
    fetch(req).then((res) => {
      if (res && res.ok) caches.open(CACHE).then((cache) => cache.put(req, res.clone()));
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(res);
    }).catch(async () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const hit = await caches.match(req);
      resolve(hit || Response.error());
    });
  });
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(isShell(url) ? networkFirst(event.request) : cacheFirst(event.request));
});
