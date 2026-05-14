// Service worker: downloads Mindustry.jar from Vercel on first load,
// caches it, and serves Range requests so CheerpJ can lazy-load class files.

const CACHE = 'mindustry-jar-v157.4-r2';
const JAR_LOCAL = '/Mindustry.jar';

// Keep buffer in memory for fast Range slicing while the SW is alive
let jarBuf = null;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (new URL(event.request.url).pathname === JAR_LOCAL) {
    event.respondWith(handleJar(event.request));
  }
});

function broadcast(data) {
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    .then(clients => clients.forEach(c => c.postMessage(data)));
}

async function loadJar() {
  if (jarBuf) return jarBuf;

  const cache = await caches.open(CACHE);
  const stored = await cache.match(JAR_LOCAL);

  if (stored) {
    broadcast({ type: 'sw-cached' });
    jarBuf = new Uint8Array(await stored.arrayBuffer());
    return jarBuf;
  }

  broadcast({ type: 'sw-downloading' });

  // SW's own fetch() bypasses this handler — goes straight to Vercel CDN
  const res = await fetch(JAR_LOCAL);
  if (!res.ok) {
    broadcast({ type: 'sw-error', detail: `HTTP ${res.status}` });
    throw new Error(`Fetch failed: ${res.status}`);
  }

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

  jarBuf = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { jarBuf.set(chunk, offset); offset += chunk.byteLength; }

  // Persist to Cache API so we survive SW restarts without re-downloading
  await cache.put(JAR_LOCAL, new Response(jarBuf.buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/java-archive',
      'Content-Length': String(jarBuf.byteLength),
      'Accept-Ranges': 'bytes',
    },
  }));

  broadcast({ type: 'sw-done', bytes: jarBuf.byteLength });
  return jarBuf;
}

async function handleJar(request) {
  try {
    const data = await loadJar();
    const total = data.byteLength;

    // HEAD — CheerpJ probes this to check file size and Range support
    if (request.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': 'application/java-archive',
          'Content-Length': String(total),
          'Accept-Ranges': 'bytes',
        },
      });
    }

    const range = request.headers.get('Range');

    // Range request — CheerpJ lazy-loads class files this way
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d*)/);
      if (m) {
        const start = parseInt(m[1], 10);
        const end   = m[2] !== '' ? parseInt(m[2], 10) : total - 1;
        const slice = data.subarray(start, end + 1);
        return new Response(slice, {
          status: 206,
          headers: {
            'Content-Type': 'application/java-archive',
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Content-Length': String(slice.byteLength),
            'Accept-Ranges': 'bytes',
          },
        });
      }
    }

    // Full GET
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/java-archive',
        'Content-Length': String(total),
        'Accept-Ranges': 'bytes',
      },
    });

  } catch (err) {
    broadcast({ type: 'sw-error', detail: String(err) });
    throw err;
  }
}
