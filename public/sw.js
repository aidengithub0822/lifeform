// Minimal service worker: just enough to make the app installable and to
// let the shell load offline. Data still requires a network connection
// (Supabase + the AI scan need it), but this avoids a blank white screen
// if the phone briefly loses signal.
const CACHE_NAME = "gainzlens-shell-v1";
const SHELL_URLS = ["/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Network-first, falling back to cache — keeps data fresh but doesn't hard-fail offline.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
