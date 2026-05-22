// Atalmart Service Worker — minimal, fast, offline-capable
// Cache strategy:
//   - App shell (HTML / JS / CSS): network-first → cache fallback
//   - Static assets (images, icons): cache-first
//   - API calls: network-only (always fresh)

const CACHE_VERSION = "v1";
const SHELL_CACHE = `atalmart-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `atalmart-static-${CACHE_VERSION}`;

// Pre-cache the bare minimum for offline first-paint
const SHELL_URLS = ["/", "/offline.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("atalmart-") && !k.endsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Skip cross-origin (fonts, external CDNs handled by browser)
  if (url.origin !== self.location.origin) return;

  // Never cache API or Next.js internals that mutate
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.pathname.startsWith("/_next/webpack-hmr")
  ) {
    return;
  }

  // Static assets (images, fonts, products) → cache-first
  if (
    url.pathname.startsWith("/products/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Documents and Next.js chunks → network-first with cache fallback
  if (request.mode === "navigate" || url.pathname.startsWith("/_next/")) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return cached || new Response("Offline", { status: 503 });
  }
}

// ─── Push notifications ─────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Atalmart", body: event.data?.text() || "" };
  }
  const title = data.title || "Atalmart";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-96.png",
    tag: data.tag || "atalmart-default",
    data: { url: data.url || "/" },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).pathname === target && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && request.method === "GET") {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await cache.match("/offline.html");
      if (offline) return offline;
    }
    return new Response("Offline", { status: 503 });
  }
}
