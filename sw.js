// Service worker: caches Mindustry.jar from GitHub Releases on first load.
// Subsequent visits serve from Cache API — no re-download needed.

const CACHE = 'mindustry-jar-v157.4';
const JAR_REMOTE = 'https://github.com/Anuken/Mindustry/releases/download/v157.4/Mindustry.jar';
// CheerpJ strips /app/ prefix — actual HTTP request lands at /Mindustry.jar
const JAR_LOCAL = '/Mindustry.jar';

// Activate immediately and take control of all clients
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const path = new URL(event.request.url).pathname;

  // Only intercept the Mindustry JAR request
  if (path === JAR_LOCAL) {
    event.respondWith(serveJar(event.request));
  }
});

async function broadcast(data) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const c of clients) c.postMessage(data);
}

async function serveJar(request) {
  const cache = await caches.open(CACHE);

  // Return from cache if available
  const cached = await cache.match(JAR_LOCAL);
  if (cached) {
    await broadcast({ type: 'sw-cached' });
    return cached;
  }

  // Download from GitHub Releases (follows the redirect to objects.githubusercontent.com)
  await broadcast({ type: 'sw-downloading' });

  let fetchResponse;
  try {
    fetchResponse = await fetch(JAR_REMOTE, { redirect: 'follow' });
  } catch (err) {
    await broadcast({ type: 'sw-error', detail: String(err) });
    throw err;
  }

  if (!fetchResponse.ok) {
    const msg = `HTTP ${fetchResponse.status} downloading JAR`;
    await broadcast({ type: 'sw-error', detail: msg });
    throw new Error(msg);
  }

  // Stream the body while tracking progress
  const contentLength = parseInt(fetchResponse.headers.get('content-length') || '0', 10);
  const reader = fetchResponse.body.getReader();
  const chunks = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;

    if (contentLength > 0) {
      broadcast({ type: 'sw-progress', pct: Math.round((received / contentLength) * 100) });
    }
  }

  // Concatenate chunks into a single Uint8Array
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // Build a clean response to cache and return
  const response = new Response(body.buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/java-archive',
      'Content-Length': String(body.byteLength),
    },
  });

  await cache.put(JAR_LOCAL, response.clone());
  await broadcast({ type: 'sw-done', bytes: body.byteLength });

  return response;
}
