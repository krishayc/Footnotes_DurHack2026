/**
 * Freeze watch: is the walker freezing right now?
 *
 * Two ways a freeze can be flagged:
 *  - Simulate freeze: a button. This is what the demo relies on.
 *  - Live phone (EXPERIMENTAL): the same freeze index on the phone's accelerometer, using the
 *    thresholds for the thigh sensor (the closest Daphnet position to a trouser pocket). Our
 *    Daphnet evaluation shows this gives many false alarms, so by default it is only shown,
 *    and does not change the music unless someone ticks the box.
 *
 * The arranger listens to `freezing` and switches to the recovery motif.
 */
import {
  FREEZE_THRESHOLDS,
  FreezeDetector,
  type FreezeFrame,
  type FreezeThresholds,
} from '@footnotes/shared';
import { Store } from '../shared/store';
import type { StudioLink } from './link';
import { stepBus } from './steps';

export type FreezeSensor = 'ankle' | 'thigh' | 'trunk';
export const SENSOR_LABEL: Record<FreezeSensor, string> = {
  ankle: 'Ankle',
  thigh: 'Thigh',
  trunk: 'Hip',
};

export interface FreezeState {
  /** Should the music be in recovery mode? */
  freezing: boolean;
  /** Why (for the screen). */
  cause: 'simulated' | 'live' | null;
  simulated: boolean;
  /** Experimental: let the live phone freeze index change the music. */
  liveDrivesMusic: boolean;
  /** Thresholds of the signal shown. */
  thresholds: FreezeThresholds;
  last: FreezeFrame | null;
  /** The live phone index says "freeze" (shown even when it doesn't drive the music). */
  liveFlag: boolean;
}

/** Laptop-time frame for the graph. */
export interface GraphFrame extends FreezeFrame {
  laptopT: number;
}

const HISTORY = 120; // 60 s of frames

class FreezeWatch {
  readonly state = new Store<FreezeState>({
    freezing: false,
    cause: null,
    simulated: false,
    liveDrivesMusic: false,
    thresholds: FREEZE_THRESHOLDS.thigh,
    last: null,
    liveFlag: false,
  });
  readonly history: GraphFrame[] = [];
  private liveDet = new FreezeDetector(FREEZE_THRESHOLDS.thigh, (f) => this.onLive(f));
  private link: StudioLink | null = null;
  private poll: number | undefined;
  private lastPhoneT = 0;

  /** Watch the phone's raw accelerometer (experimental live freeze index). */
  attachLink(link: StudioLink) {
    this.link = link;
    window.clearInterval(this.poll);
    this.poll = window.setInterval(() => this.pollLive(), 100);
    return () => {
      window.clearInterval(this.poll);
      this.link = null;
    };
  }

  private pollLive() {
    const link = this.link;
    if (!link || stepBus.settings.get().mode !== 'live') return;
    const a = link.accel;
    a.forEachSince(this.lastPhoneT + 0.001, (i) => {
      this.liveDet.push(a.t[i], Math.hypot(a.x[i], a.y[i], a.z[i]));
      this.lastPhoneT = a.t[i];
    });
  }

  private onLive(f: FreezeFrame) {
    const laptopT = this.link?.toLocal(f.t) ?? performance.now();
    this.addFrame({ ...f, laptopT });
    this.state.set({ liveFlag: f.freezing });
    this.update();
  }

  setSimulated(on: boolean) {
    this.state.set({ simulated: on });
    this.update();
  }

  setLiveDrivesMusic(on: boolean) {
    this.state.set({ liveDrivesMusic: on });
    this.update();
  }

  private addFrame(f: GraphFrame) {
    this.history.push(f);
    if (this.history.length > HISTORY) this.history.shift();
    this.state.set({ last: f });
  }

  private update() {
    const s = this.state.get();
    const cause: FreezeState['cause'] = s.simulated
      ? 'simulated'
      : s.liveDrivesMusic && s.liveFlag
        ? 'live'
        : null;
    if (cause !== s.cause || (cause !== null) !== s.freezing)
      this.state.set({ cause, freezing: cause !== null });
  }
}

export const freezeWatch = new FreezeWatch();
