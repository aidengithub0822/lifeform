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

// Web Push: the payload is whatever JSON src/lib/push.ts sent
// ({ title, body, url }). Falls back to generic text if it's ever missing
// or malformed so a push never silently does nothing.
self.addEventListener("push", (event) => {
  let data = { title: "lifeform", body: "You have a new notification.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // not JSON — keep the fallback
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: data.url || "/" },
    })
  );
});

// Tapping the notification focuses an already-open tab if there is one,
// otherwise opens a new one at the target URL.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
