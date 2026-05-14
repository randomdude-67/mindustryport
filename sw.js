// Service worker: caches Mindustry.jar on first load, serves from cache after.
// The JAR is baked into the Vercel deployment (downloaded at build time),
// so the fetch is same-origin — no CORS issues.

const CACHE = 'mindustry-jar-v157.4';
const JAR_LOCAL = '/Mindustry.jar'; // CheerpJ strips /app/ prefix

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (new URL(event.request.url).pathname === JAR_LOCAL) {
    event.respondWith(serveJar());
  }
});

function broadcast(data) {
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    .then(clients => clients.forEach(c => c.postMessage(data)));
}

async function serveJar() {
  const cache = await caches.open(CACHE);

  const cached = await cache.match(JAR_LOCAL);
  if (cached) {
    broadcast({ type: 'sw-cached' });
    return cached;
  }

  broadcast({ type: 'sw-downloading' });

  // Fetch from same origin (Vercel CDN) — SW's own fetch() bypasses this handler
  let res;
  try {
    res = await fetch(JAR_LOCAL);
  } catch (err) {
    broadcast({ type: 'sw-error', detail: String(err) });
    throw err;
  }

  if (!res.ok) {
    const msg = `HTTP ${res.status} fetching JAR`;
    broadcast({ type: 'sw-error', detail: msg });
    throw new Error(msg);
  }

  // Stream with progress tracking
  const total = parseInt(res.headers.get('content-length') || '0', 10);
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (total > 0) {
      broadcast({ type: 'sw-progress', pct: Math.round((received / total) * 100) });
    }
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }

  const response = new Response(body.buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/java-archive',
      'Content-Length': String(body.byteLength),
    },
  });

  await cache.put(JAR_LOCAL, response.clone());
  broadcast({ type: 'sw-done', bytes: body.byteLength });

  return response;
}
