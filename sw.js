const CACHE = "syntax-dictionary-v5";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(APP_SHELL.map(async (url) => {
        try {
          await cache.add(url);
        } catch (e) {
          // 1件の取得失敗で新しいService Workerの導入自体が止まらないようにする
        }
      }));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();

      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.all(windows.map(async (client) => {
        const current = await askVersion(client);
        if (current === "v5") return;
        if (client.navigate) {
          try {
            await client.navigate(client.url);
          } catch (e) {}
        }
      }));
    })()
  );
});

function askVersion(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(""), 1000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    try {
      client.postMessage({ type: "version-check" }, [channel.port2]);
    } catch (e) {
      clearTimeout(timer);
      resolve("");
    }
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isHTML = event.request.mode === "navigate"
    || url.pathname.endsWith("/")
    || url.pathname.endsWith("/index.html");

  if (isHTML) {
    event.respondWith(networkFirst(event.request, true));
    return;
  }

  event.respondWith(networkFirst(event.request, false));
});

async function networkFirst(request, isHTML) {
  try {
    const response = await fetch(request);
    if (response && response.ok && new URL(request.url).origin === self.location.origin) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (isHTML) {
      return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
    }
    return Response.error();
  }
}
