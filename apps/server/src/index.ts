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
import { appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
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
const recordingsDir = resolve(here, '../../../recordings');

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
/**
 * Connection log: printed, and also appended to recordings/connection.log so a dropped
 * phone can be diagnosed afterwards (who left, when, and why).
 */
const connLogFile = resolve(recordingsDir, 'connection.log');
function writeConnLog(line: string) {
  try {
    mkdirSync(recordingsDir, { recursive: true });
    appendFileSync(connLogFile, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* logging must never break the server */
  }
}
const log = (room: string, text: string) => {
  console.log(`${new Date().toLocaleTimeString()} [room ${room}] ${text}`);
  writeConnLog(`[room ${room}] ${text}`);
};

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

/**
 * Phone sensor recordings (for tuning step detection on real walking). The phone posts ~30 s
 * of raw accelerometer data plus the steps it detected; we save it as recordings/<name>.json,
 * where `npm run analyze -- <file>` can replay it. The file name is chosen here, never by the
 * sender, and there is a size and count limit.
 */
app.post('/api/recordings', express.json({ limit: '4mb' }), (req, res) => {
  const body = req.body as { samples?: unknown };
  if (!body || !Array.isArray(body.samples)) {
    res.status(400).json({ error: 'No samples' });
    return;
  }
  mkdirSync(recordingsDir, { recursive: true });
  if (readdirSync(recordingsDir).length > 300) {
    res.status(507).json({ error: 'Too many recordings saved already' });
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `walk-${stamp}.json`;
  writeFileSync(resolve(recordingsDir, name), JSON.stringify(body));
  console.log(`Saved recording recordings/${name} (${body.samples.length} samples)`);
  res.json({ name });
});
/** The phone/laptop reports its own view of a dropped connection (sent over plain HTTP). */
app.post('/api/clientlog', express.json({ limit: '64kb' }), (req, res) => {
  const b = req.body as { role?: unknown; room?: unknown; events?: unknown };
  const events = Array.isArray(b?.events) ? b.events.slice(-80) : [];
  const who = `${String(b?.role).slice(0, 10)} room ${String(b?.room).slice(0, 8)}`;
  writeConnLog(`[client ${who}] ${events.map((e) => String(e).slice(0, 200)).join(' | ')}`);
  res.json({ ok: true });
});
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
      writeConnLog(`[heartbeat] no pong for ${HEARTBEAT_MS / 1000} s: dropping a connection`);
      ws.terminate(); // triggers 'close', which tells the peer
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, HEARTBEAT_MS).unref();

wss.on('connection', (ws, req) => {
  let roomCode: string | null = null;
  let role: Role | null = null;
  const openedAt = Date.now();
  const via = req.headers['cf-connecting-ip'] ? 'tunnel' : 'local';

  ws.on('message', (data) => {
    const msg = parseMessage(data.toString());
    if (!msg) {
      send(ws, { type: 'error', code: 'bad-message', message: 'Unrecognised message' });
      return;
    }

    if (msg.type === 'keepalive') {
      send(ws, { type: 'keepalive' });
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
      if (existing && existing !== ws) {
        log(code, `${msg.role} replaced by a newer connection`);
        existing.close(4000, 'replaced');
      }
      room[msg.role] = ws;
      rooms.set(code, room);
      roomCode = code;
      role = msg.role;

      const peer = room[other(msg.role)];
      log(code, `${msg.role} joined via ${via}${peer ? ` (${other(msg.role)} already here)` : ''}`);
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

  ws.on('close', (closeCode, reason) => {
    if (!roomCode || !role) return;
    const why = `code ${closeCode}${reason.length ? ` "${reason.toString()}"` : ''}, after ${Math.round((Date.now() - openedAt) / 1000)} s, via ${via}`;
    const room = rooms.get(roomCode);
    if (!room || room[role] !== ws) {
      writeConnLog(`[room ${roomCode}] old ${role} connection closed (${why})`);
      return;
    }
    delete room[role];
    log(roomCode, `${role} left (${why})`);
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
