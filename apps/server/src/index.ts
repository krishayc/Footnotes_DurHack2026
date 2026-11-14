/**
 * Footnotes relay server.
 *
 * Jobs:
 *  1. Serve the built web app (production / demo mode) from apps/web/dist.
 *  2. Accept WebSocket connections on /ws and group them into rooms by a 4-letter code.
 *     Each room holds at most one Sensor (phone) and one Studio (laptop).
 *  3. GET /health for a quick "is the server alive?" check.
 *
 * Stage 0 handles joining rooms and telling each side whether the other is there.
 * Forwarding step / accel / clock-sync messages between the two sides is added in Stage 3.
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

// ---------- http ----------
const app = express();
app.get('/health', (_req, res) => {
  res.json({ ok: true, name: 'footnotes', protocol: PROTOCOL_VERSION, rooms: rooms.size });
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
      send(ws, { type: 'hello', room: code, role: msg.role, peerConnected: !!peer });
      send(peer, { type: 'peer', connected: true, role: msg.role });
      return;
    }

    // Stage 3: forward everything else to the other side of the room.
  });

  ws.on('close', () => {
    if (!roomCode || !role) return;
    const room = rooms.get(roomCode);
    if (!room || room[role] !== ws) return;
    delete room[role];
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
