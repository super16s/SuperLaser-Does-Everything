// App-shell cache for the PWA — makes the UI itself installable and
// loadable offline. API responses (/api/*) are always live data, so they
// deliberately bypass the cache entirely rather than risk serving stale
// generated images.

const CACHE_NAME = "superlaser-social-app-v2";
// "/" is deliberately not precached: it sits behind a login, so an
// unauthenticated install would cache a redirect to /login instead.
const APP_SHELL = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    // Network-first so login state is always honoured; cache only real pages.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok && !res.redirected && url.pathname === "/") {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/").then((cached) => cached || Response.error()))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
