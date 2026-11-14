/**
 * Footnotes relay server.
 *
 * Jobs:
 *  1. Serve the built web app (production / demo mode) from apps/web/dist.
 *  2. Accept WebSocket connections on /ws and group them into rooms by a 4-letter code.
 *     Each room holds at most one Sensor (phone) and one Studio (laptop).
 *  3. GET /health for a quick "is the server alive?" check.
 *
 * After joining, every other message is forwarded untouched to the other side of the room
 * (steps, sensor batches, clock-sync pings/pongs, status, calibration). The server never
 * interprets timing data: clock sync happens end to end between phone and laptop.
 *
 * A heartbeat (WebSocket ping every 10 s) finds connections that died silently (phone
 * locked, WiFi dropped) so the other side is told promptly that its peer has gone.
 *
 * Why tsx (not compiled JS) in production? It removes a build step at 3am. tsx runs the
 * TypeScript directly; the server is small, so the startup cost is negligible.
 */
import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  WS_PATH,
  normaliseRoomCode,
  parseMessage,
  type Role,
  type ServerMsg,
} from '@footnotes/shared';

const PORT = Number(process.env.PORT ?? 8787);
const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(here, '../../web/dist');

// ---------- rooms ----------
interface Room {
  sensor?: WebSocket;
  studio?: WebSocket;
}
const rooms = new Map<string, Room>();

function send(ws: WebSocket | undefined, msg: ServerMsg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
const other = (role: Role): Role => (role === 'sensor' ? 'studio' : 'sensor');
const log = (room: string, text: string) =>
  console.log(`${new Date().toLocaleTimeString()} [room ${room}] ${text}`);

// ---------- http ----------
const app = express();
app.get('/health', (_req, res) => {
  res.json({ ok: true, name: 'footnotes', protocol: PROTOCOL_VERSION, rooms: rooms.size });
});

/**
 * The public https URL (from the Cloudflare tunnel) so the Studio's QR code points somewhere
 * a phone can reach. scripts/tunnel.mjs posts it here; only accepted from this machine.
 */
let publicUrl: string | null = null;
app.get('/api/public-url', (_req, res) => res.json({ url: publicUrl }));
app.post('/api/public-url', express.json(), (req, res) => {
  const ip = req.socket.remoteAddress ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) || req.headers['cf-connecting-ip']) {
    res.status(403).end();
    return;
  }
  const url = typeof req.body?.url === 'string' ? req.body.url : null;
  publicUrl = url && /^https:\/\/[a-z0-9.-]+$/i.test(url) ? url : null;
  console.log(publicUrl ? `Public URL: ${publicUrl}` : 'Public URL cleared');
  res.json({ url: publicUrl });
});

if (existsSync(webDist)) {
  app.use(express.static(webDist));
  // Single-page app: any unknown route (/, /sensor, /studio) gets index.html.
  app.get('*', (_req, res) => res.sendFile(resolve(webDist, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res
      .type('text')
      .send(
        'Footnotes server is running. No web build found: run `npm run build`, or use `npm run dev` and open http://localhost:5173',
      ),
  );
}

const server = createServer(app);

// ---------- websocket ----------
const wss = new WebSocketServer({ server, path: WS_PATH });

const alive = new WeakMap<WebSocket, boolean>();
const HEARTBEAT_MS = 10_000;
setInterval(() => {
  for (const ws of wss.clients) {
    if (alive.get(ws) === false) {
      ws.terminate(); // triggers 'close', which tells the peer
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, HEARTBEAT_MS).unref();

wss.on('connection', (ws) => {
  let roomCode: string | null = null;
  let role: Role | null = null;

  ws.on('message', (data) => {
    const msg = parseMessage(data.toString());
    if (!msg) {
      send(ws, { type: 'error', code: 'bad-message', message: 'Unrecognised message' });
      return;
    }

    if (msg.type === 'join') {
      if (msg.protocol !== PROTOCOL_VERSION) {
        send(ws, { type: 'error', code: 'version-mismatch', message: 'Please reload the page.' });
        return;
      }
      const code = normaliseRoomCode(msg.room);
      if (!code) {
        send(ws, {
          type: 'error',
          code: 'bad-room',
          message: 'That room code does not look right.',
        });
        return;
      }
      const room = rooms.get(code) ?? {};
      const existing = room[msg.role];
      // A newer connection replaces an old one (e.g. the phone reloaded the page).
      if (existing && existing !== ws) existing.close(4000, 'replaced');
      room[msg.role] = ws;
      rooms.set(code, room);
      roomCode = code;
      role = msg.role;

      const peer = room[other(msg.role)];
      log(code, `${msg.role} joined${peer ? ` (${other(msg.role)} already here)` : ''}`);
      send(ws, { type: 'hello', room: code, role: msg.role, peerConnected: !!peer });
      send(peer, { type: 'peer', connected: true, role: msg.role });
      return;
    }

    // Everything else: forward to the other side of the room.
    if (!roomCode || !role) return;
    const peer = rooms.get(roomCode)?.[other(role)];
    if (peer && peer.readyState === peer.OPEN) peer.send(data.toString());
  });

  // Heartbeat bookkeeping: the browser answers our pings automatically.
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));

  ws.on('close', () => {
    if (!roomCode || !role) return;
    const room = rooms.get(roomCode);
    if (!room || room[role] !== ws) return;
    delete room[role];
    log(roomCode, `${role} left`);
    send(room[other(role)], { type: 'peer', connected: false, role });
    if (!room.sensor && !room.studio) rooms.delete(roomCode);
  });
});

server.listen(PORT, () => {
  console.log(`Footnotes server on http://localhost:${PORT}  (websocket ${WS_PATH})`);
  console.log(
    existsSync(webDist) ? `Serving web build from ${webDist}` : 'No web build found (dev mode).',
  );
});
