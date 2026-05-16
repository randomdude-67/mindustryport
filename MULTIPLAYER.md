# Multiplayer Roadmap

Browser → desktop-Mindustry multiplayer via a WebSocket-to-UDP relay.

## The problem

Mindustry's networking is `arc.net.ArcNetProvider`, built on:
- `java.nio.channels.DatagramChannel` (UDP)
- `java.nio.channels.Selector` / `epoll`
- Raw socket I/O

None of that works in a browser:
- **No raw UDP**. Browsers only support WebSocket (TCP-based) and WebRTC.
- **CheerpJ's JDK has no `epoll`**. Even if we faked the sockets, the selector layer would still crash.

So we need to **replace the Net layer entirely** for the browser build, and bridge browser clients to the real UDP wire protocol via a relay server.

## Architecture

```
Browser client ──WebSocket──> Relay server ──UDP──> Mindustry game server
                                              <───
                                  ^
                                  │ (multiple browser
                                  │  clients possible)
                                  │
Browser client ──WebSocket──>────┘
```

The relay is a small Node/Go process that:
1. Accepts WebSocket connections from browsers
2. For each connection, opens a UDP socket to the target Mindustry server
3. Forwards Mindustry binary packets in both directions, length-prefixed over WebSocket
4. Tracks per-connection ports so reply UDP packets from the server route back to the right WebSocket

Browser players appear as normal UDP-Mindustry players to the server. Other desktop players don't know they're talking to a relay.

## Code-level plan

### 1. Patch out `ArcNetProvider` in the JARs

`mindustry.desktop.DesktopLauncher.getNet()` returns an `ArcNetProvider`. Patch it to instantiate our JS-bridge Net implementation instead. Bytecode-wise, easiest is to:

- Patch `DesktopLauncher.getNet()` to `aconst_null; areturn` (bytes `0x01 0xb0`), forcing singleplayer-only as a stop-gap. This is what unblocks the current `Selector.<init>` crash.
- THEN: write a Java class `mindustry.net.WebNet extends mindustry.net.Net.NetProvider` that implements `connect`/`disconnect`/`send`/`update` by calling out to JS-side methods via stub natives.
- Ship `WebNet.class` in `override/` and re-patch `getNet()` to instantiate it.

### 2. Implement JS-side Net via JNI stubs

In `natives/arc.js` (or a new `natives/net.js`), add:

```js
async Java_mindustry_net_WebNet_jsConnect(lib, host, tcpPort, udpPort) { /* open WebSocket to relay */ }
async Java_mindustry_net_WebNet_jsSend(lib, bytes, reliable) { /* ws.send(bytes) */ }
async Java_mindustry_net_WebNet_jsPoll(lib) { /* return queued incoming packet or null */ }
async Java_mindustry_net_WebNet_jsClose(lib) { /* ws.close() */ }
```

State lives in JS (the actual `WebSocket` object and packet queues). Java side just calls these natives each frame to push/pull packets.

### 3. Relay server

Stack: Node.js + `ws` library. ~150 lines.

Outline:
```js
import { WebSocketServer } from 'ws';
import dgram from 'node:dgram';

const wss = new WebSocketServer({ port: 6567 });

wss.on('connection', (ws) => {
  const udp = dgram.createSocket('udp4');
  let targetHost, targetPort;

  ws.on('message', (data) => {
    // First message is JSON {host, port}; subsequent are raw Mindustry packets
    if (!targetHost) {
      const cfg = JSON.parse(data);
      targetHost = cfg.host; targetPort = cfg.port;
      return;
    }
    udp.send(data, targetPort, targetHost);
  });

  udp.on('message', (msg) => {
    ws.send(msg, { binary: true });
  });

  ws.on('close', () => udp.close());
});
```

Host this on:
- Your own machine (you mentioned it stays on 24/7 — perfect)
- Or a $5/mo VPS (DigitalOcean droplet, Hetzner, etc.)

Domain + TLS (WebSocket Secure) needed for the browser to connect from a `https://` page. Cloudflare Tunnel handles both for free if you run it on your own machine.

### 4. Mindustry server-list integration

Mindustry has a public server list at `https://mindustry.dev/servers_v7.json`. Browser players should be able to see and join those.

The JSON has `{address, port}` entries. Browser-side, when the player clicks a server, our `WebNet.connect(host, port)` opens WebSocket to the relay and tells the relay where to forward UDP. Mindustry never knows it's not direct UDP.

CORS may be an issue fetching that JSON from a browser — proxy it through your Vercel rewrites if needed.

## Effort estimate

- Relay server: 1 day
- `WebNet` Java class + bytecode patch in build pipeline: 2-3 days
- JS-side `natives/net.js` with WebSocket + packet queue: 2-3 days
- Testing against a real Mindustry server, fixing protocol quirks: 1-2 weeks
- Hosting + TLS setup: half a day

Total: **2-3 weeks of focused work**, not a single session.

## What you can do right now to make future-you's life easier

Even before writing any of the above, **patch `DesktopLauncher.getNet()` to return `null`**. That unblocks the current `EPollSelectorImpl` crash and gets you to a working singleplayer build. The `null` return is exactly the "future hook" where the WebNet implementation will eventually plug in.

The byte pattern is `getstatic` or `new` at offset 0 of `getNet()`'s code (use `javap -p -c Mindustry.jar mindustry.desktop.DesktopLauncher` to confirm). Replace the first 1-2 bytes with `01 b0` (`aconst_null; areturn`).

## Why this stays parked until then

- Singleplayer + campaign + editor all work without a Net provider
- Multiplayer is the project's biggest remaining chunk and deserves its own concentrated session
- Premature partial implementation would leak bugs into the singleplayer path
