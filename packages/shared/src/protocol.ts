/**
 * The Footnotes message protocol.
 *
 * Every message between the phone (Sensor), the relay server and the laptop (Studio)
 * is JSON with a `type` field. Both apps import these types, so if one side changes a
 * message shape the other side fails to compile instead of failing at the demo table.
 *
 * Time: all `t` fields are milliseconds on the SENDER's clock (performance.now() based,
 * see `clockNow` in each app). The Studio converts phone times to laptop times using the
 * clock-sync offset estimated from ping/pong (built in Stage 3).
 */

export const PROTOCOL_VERSION = 1;
export const WS_PATH = '/ws';

export type Role = 'sensor' | 'studio';

/** Client -> server: join a room as the sensor or the studio. */
export interface JoinMsg {
  type: 'join';
  room: string;
  role: Role;
  protocol: number;
}

/** Server -> client: confirms the join and says whether the other side is present. */
export interface HelloMsg {
  type: 'hello';
  room: string;
  role: Role;
  peerConnected: boolean;
}

/** Server -> client: the other side connected or disconnected. */
export interface PeerMsg {
  type: 'peer';
  connected: boolean;
  role: Role;
}

/** Server -> client: something went wrong (bad room code, room full, ...). */
export interface ErrorMsg {
  type: 'error';
  code: 'bad-room' | 'room-full' | 'bad-message' | 'version-mismatch';
  message: string;
}

/**
 * Clock sync (NTP style). The Studio sends `ping` with its send time t0.
 * The phone replies immediately with `pong` carrying t0 and its own clock time t1.
 * The Studio records the receive time t2. Round trip = t2 - t0.
 * Offset estimate (phone clock minus studio clock) = t1 - (t0 + t2) / 2.
 */
export interface PingMsg {
  type: 'ping';
  id: number;
  t0: number;
}
export interface PongMsg {
  type: 'pong';
  id: number;
  t0: number;
  t1: number;
}

/** Phone -> Studio: one detected step. */
export interface StepMsg {
  type: 'step';
  /** Phone clock time of the step peak, ms. */
  t: number;
  /** Running step count since the sensor started. */
  n: number;
  /** 0..1, how clear the peak was (optional). */
  confidence?: number;
  /** True when the step was inferred (only one leg is being felt; see stepDetector.ts). */
  inferred?: boolean;
}

/** A single accelerometer sample: phone-clock time and x/y/z in m/s^2 (incl. gravity). */
export type AccelSample = [t: number, x: number, y: number, z: number];

/** Phone -> Studio: a batch of raw samples (sent every ~150 ms). */
export interface AccelBatchMsg {
  type: 'accelBatch';
  samples: AccelSample[];
  /** Measured sensor sample rate in Hz. */
  rateHz: number;
}

/** Either side -> other: general status (battery saver, permission state, etc.). */
export interface StatusMsg {
  type: 'status';
  motion: 'unknown' | 'granted' | 'denied' | 'unsupported';
  wakeLock: boolean;
  rateHz?: number;
  /** The phone is treating each bump as a stride (one leg felt) and counting it as 2 steps. */
  oneLeg?: boolean;
  /** The phone's leg setting. */
  legMode?: 'both' | 'one' | 'auto';
  /** The phone's own pace estimate, steps per minute. */
  cadenceSpm?: number | null;
}

/** Studio <-> phone: calibration flow. */
export interface CalibrationStartMsg {
  type: 'calibrationStart';
  durationMs: number;
}
export interface CalibrationResultMsg {
  type: 'calibrationResult';
  /** Median steps per minute during calibration. */
  cadenceSpm: number;
  /** Beat tempo chosen (BPM, one beat = one step). */
  tempoBpm: number;
  stepsCounted: number;
  reliable: boolean;
}

/**
 * Either way, client <-> server: "are you still there?". Each client sends one every 3 s and the
 * server answers straight away. A client that hears nothing at all for 8 s assumes its
 * connection died silently (common when a phone locks or Safari pauses the page: the socket
 * still looks open but nothing gets through) and reconnects. Never forwarded to the peer.
 */
export interface KeepaliveMsg {
  type: 'keepalive';
}

/** Studio -> phone: how to count bumps (set from the Studio when a pocket feels one leg). */
export interface SetLegModeMsg {
  type: 'setLegMode';
  legMode: 'both' | 'one' | 'auto';
}

/** Phone -> Studio: the patient app asks the laptop to do something. */
export interface WalkCommandMsg {
  type: 'walkCommand';
  action: 'calibrate' | 'cancelCalibration' | 'startBeat' | 'stopBeat' | 'nudge' | 'setOffset';
  /** nudge: BPM change (e.g. ±2). setOffset: fraction (e.g. 0.05). */
  value?: number;
}

/**
 * Studio -> phone: what the walk looks like right now (sent on every change and once a
 * second). The phone's patient screens are drawn from this.
 */
export interface WalkStateMsg {
  type: 'walkState';
  phase: 'idle' | 'calibrating' | 'ready' | 'walking';
  /** Has someone clicked Start audio on the laptop? */
  audioOn: boolean;
  calLeftMs: number | null;
  calSteps: number;
  calNotes: string[];
  baseline: number | null;
  tempo: number;
  offset: number;
  /** Smoothed in-step score 0..1. */
  score: number;
  layersOn: string[];
  nextLayer: string | null;
  /** A recent beat, in the PHONE's clock (so the phone can pulse exactly on the beat). */
  beatPhoneT: number | null;
  periodMs: number;
}

export type ClientMsg =
  | JoinMsg
  | WalkCommandMsg
  | WalkStateMsg
  | KeepaliveMsg
  | SetLegModeMsg
  | PingMsg
  | PongMsg
  | StepMsg
  | AccelBatchMsg
  | StatusMsg
  | CalibrationStartMsg
  | CalibrationResultMsg;

export type ServerMsg = HelloMsg | PeerMsg | ErrorMsg | KeepaliveMsg;

/** Messages the relay forwards untouched from one side of a room to the other. */
export type RelayedMsg = Exclude<ClientMsg, JoinMsg | KeepaliveMsg>;

export type AnyMsg = ClientMsg | ServerMsg;

const KNOWN_TYPES = new Set<AnyMsg['type']>([
  'join',
  'keepalive',
  'hello',
  'peer',
  'error',
  'ping',
  'pong',
  'step',
  'accelBatch',
  'status',
  'calibrationStart',
  'calibrationResult',
  'setLegMode',
  'walkCommand',
  'walkState',
]);

/** Parse a raw WebSocket frame. Returns null for anything that is not a known message. */
export function parseMessage(raw: unknown): AnyMsg | null {
  if (typeof raw !== 'string') return null;
  try {
    const msg = JSON.parse(raw) as { type?: unknown };
    if (msg && typeof msg.type === 'string' && KNOWN_TYPES.has(msg.type as AnyMsg['type'])) {
      return msg as AnyMsg;
    }
  } catch {
    /* not JSON */
  }
  return null;
}
