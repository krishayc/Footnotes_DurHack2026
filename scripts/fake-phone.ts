/**
 * A pretend phone, for testing the Studio without anyone walking.
 *
 *   npm run fake-phone -- ABCD                       # room code, local server
 *   npm run fake-phone -- ABCD https://x.trycloudflare.com --spm 100 --clock-offset 5000
 *
 * It generates a synthetic pocket-walking signal in real time, runs the SAME step detector as
 * the phone, and speaks the same protocol: answers clock-sync pings, sends steps and
 * accelerometer batches. Its clock is deliberately shifted (default +123.456 s), and it prints
 * its clock's start time so you can check the Studio's offset estimate against the truth:
 *   true offset = shift + (Studio tab's performance.timeOrigin - fake phone's timeOrigin)
 */
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import {
  PROTOCOL_VERSION,
  StepDetector,
  WS_PATH,
  normaliseRoomCode,
  parseMessage,
  synthWalk,
  type AccelSample,
  type RelayedMsg,
} from '@footnotes/shared';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const room = normaliseRoomCode(positional[0] ?? '');
if (!room) {
  console.error(
    'Usage: npm run fake-phone -- <ROOM> [server-url] [--spm 105] [--clock-offset 123456]',
  );
  process.exit(1);
}
const base = positional[1] ?? 'http://localhost:8787';
const spm = flag('spm', 105);
const clockOffset = flag('clock-offset', 123456);
const wsUrl = base.replace(/^http/, 'ws') + WS_PATH;

/** The fake phone's clock: this computer's clock plus a fixed offset. */
const phoneNow = () => performance.now() + clockOffset;

const walk = synthWalk({ cadenceSpm: spm, seconds: 3600, seed: Date.now() % 1000 });
const ws = new WebSocket(wsUrl);
const send = (m: RelayedMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
let pending: AccelSample[] = [];
const detector = new StepDetector({}, (s) =>
  send({
    type: 'step',
    t: s.t,
    n: s.n,
    confidence: s.confidence,
    inferred: s.inferred || undefined,
  }),
);

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'join', room, role: 'sensor', protocol: PROTOCOL_VERSION }));
  console.log(`Fake phone joined room ${room} at ${wsUrl}, walking at ${spm} steps/min.`);
  console.log(
    `Clock check: timeOrigin ${performance.timeOrigin.toFixed(3)}, shift ${clockOffset} ms. ` +
      "Expected Studio offset (ms) = shift + (Studio tab's performance.timeOrigin - this timeOrigin).",
  );
});
ws.on('message', (data) => {
  const msg = parseMessage(data.toString());
  if (msg?.type === 'ping') send({ type: 'pong', id: msg.id, t0: msg.t0, t1: phoneNow() });
  if (msg?.type === 'error') console.error('Server:', msg.message);
});
ws.on('close', () => {
  console.log('Disconnected.');
  process.exit(0);
});

// Feed the synthetic signal in real time.
const start = phoneNow();
let k = 0;
setInterval(() => {
  const elapsed = phoneNow() - start;
  while (k < walk.samples.length && walk.samples[k][0] <= elapsed) {
    const [st, x, y, z] = walk.samples[k++];
    const t = start + st;
    detector.push(t, x, y, z);
    pending.push([t, x, y, z]);
  }
}, 10);
setInterval(() => {
  if (pending.length) send({ type: 'accelBatch', samples: pending, rateHz: 60 });
  pending = [];
}, 150);
setInterval(() => send({ type: 'status', motion: 'granted', wakeLock: true, rateHz: 60 }), 2000);
