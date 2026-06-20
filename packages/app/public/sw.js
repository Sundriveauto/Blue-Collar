const CACHE_VERSION = 1;
const CACHE_NAME = `bluecollar-v${CACHE_VERSION}`;
const SHELL_CACHE = `bluecollar-shell-v${CACHE_VERSION}`;
const DATA_CACHE = `bluecollar-data-v${CACHE_VERSION}`;
const IMG_CACHE = `bluecollar-images-v${CACHE_VERSION}`;

const STATIC_ASSETS = ["/", "/favicon.svg", "/logo.png", "/manifest.json"];
const MAX_DATA_CACHE_SIZE = 50;
const MAX_IMG_CACHE_SIZE = 100;

// ─── Install: pre-cache app shell ────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(SHELL_CACHE);
      await shellCache.addAll(STATIC_ASSETS);
    })()
  );
  self.skipWaiting();
});

// ─── Activate: clean old caches & set up sync ────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.includes(`v${CACHE_VERSION}`))
          .map((k) => caches.delete(k))
      );
      self.clients.claim();
    })()
  );
});

// ─── Fetch: tiered caching strategy ──────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Worker data: stale-while-revalidate
  if (url.pathname.startsWith("/api/workers")) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE, MAX_DATA_CACHE_SIZE));
    return;
  }

  // Categories: cache-first with long TTL
  if (url.pathname.startsWith("/api/categories")) {
    event.respondWith(cacheFirstWithExpiry(request, DATA_CACHE, 7 * 24 * 60 * 60));
    return;
  }

  // Auth state: network-first (avoid stale auth)
  if (url.pathname.startsWith("/api/auth")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Navigation: network-first with shell fallback
  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithShellFallback(request));
    return;
  }

  // Images: cache-first
  if (url.pathname.match(/\.(png|jpg|jpeg|webp|svg|gif)$/i)) {
    event.respondWith(cacheFirst(request, IMG_CACHE, MAX_IMG_CACHE_SIZE));
    return;
  }

  // Static assets: cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.match(/\.(woff2?|css|js)$/)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  }
});

// ─── Background Sync ────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-offline-queue") {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  try {
    const db = await openIndexedDB();
    const queue = await getAllFromQueue(db, "offline-actions");
    
    for (const action of queue) {
      try {
        const response = await fetch(action.request.url, {
          method: action.request.method,
          headers: action.request.headers,
          body: action.request.body,
        });

        if (response.ok) {
          await deleteFromQueue(db, "offline-actions", action.id);
          self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
              client.postMessage({
                type: "SYNC_SUCCESS",
                id: action.id,
              });
            });
          });
        }
      } catch (error) {
        console.error("[SW] Sync failed for action", action.id, error);
      }
    }
  } catch (error) {
    console.error("[SW] Background sync error:", error);
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("bluecollar", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("offline-actions")) {
        db.createObjectStore("offline-actions", { keyPath: "id" });
      }
    };
  });
}

function getAllFromQueue(db, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deleteFromQueue(db, storeName, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// ─── Caching Strategies ──────────────────────────────────────────────────────
async function staleWhileRevalidate(request, cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((res) => {
    if (res.ok) {
      cache.put(request, res.clone());
      trimCache(cacheName, maxSize);
    }
    return res;
  });

  return cached || fetchPromise.catch(() => new Response("Offline", { status: 503 }));
}

async function cacheFirstWithExpiry(request, cacheName, ttlSeconds) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    const age = (Date.now() - new Date(cached.headers.get("sw-fetch-time")).getTime()) / 1000;
    if (age < ttlSeconds) return cached;
  }

  try {
    const res = await fetch(request);
    if (res.ok) {
      const resClone = res.clone();
      const newRes = new Response(resClone.body, {
        status: resClone.status,
        statusText: resClone.statusText,
        headers: new Headers(resClone.headers),
      });
      newRes.headers.set("sw-fetch-time", new Date().toISOString());
      cache.put(request, newRes);
    }
    return res;
  } catch {
    return cached || new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(DATA_CACHE);
    return cache.match(request) || new Response("Offline", { status: 503 });
  }
}

async function networkFirstWithShellFallback(request) {
  try {
    return await fetch(request);
  } catch {
    return caches.match(request) || caches.match("/");
  }
}

async function cacheFirst(request, cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const res = await fetch(request);
    if (res.ok) {
      cache.put(request, res.clone());
      if (maxSize) trimCache(cacheName, maxSize);
    }
    return res;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function trimCache(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxSize) {
    await cache.delete(keys[0]);
    return trimCache(cacheName, maxSize);
  }
}

// ─── Push Notifications ──────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/logo.png",
      badge: data.badge || "/favicon.svg",
      tag: data.tag || "notification",
      requireInteraction: data.requireInteraction || false,
      data: data.data || {},
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  const urlToOpen = data.url || "/";
  
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
