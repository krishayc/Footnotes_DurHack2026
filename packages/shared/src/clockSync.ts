/**
 * Clock sync between the phone and the laptop (NTP-style).
 *
 * The problem: the phone stamps each step with ITS clock (performance.now() on the phone).
 * The laptop plays the beat on ITS clock. The two clocks started at different moments, so the
 * same instant has two different numbers. To compare a step with the beat we need the offset.
 *
 * One exchange:
 *   laptop sends ping at t0 (laptop clock)
 *   phone replies at t1 (phone clock)
 *   laptop receives the pong at t2 (laptop clock)
 *
 *   round trip  rtt    = t2 - t0
 *   offset      offset = t1 - (t0 + t2) / 2      (phone clock minus laptop clock)
 *
 * The offset formula assumes the trip there took as long as the trip back. If not, the error
 * is at most rtt / 2. So exchanges with the SMALLEST round trip are the most trustworthy:
 * there was little time for the network to be lopsided. We keep the recent exchanges, take
 * the fastest few, and use the median of their offsets. Repeating every couple of seconds keeps
 * up with the clocks slowly drifting apart.
 */
import { median } from './dsp/stats';

export interface SyncSample {
  rtt: number;
  offset: number;
  at: number; // laptop time when measured
}

export interface ClockEstimate {
  /** Phone clock minus laptop clock, ms. */
  offset: number;
  /** Best recent round trip, ms. */
  rtt: number;
  /** Worst-case error of the offset (half the round trip of the samples used), ms. */
  uncertainty: number;
  samples: number;
}

/** If this many new exchanges in a row disagree with the estimate by more than JUMP_MS... */
const JUMP_STREAK = 3;
const JUMP_MS = 500;

export class ClockSync {
  private samples: SyncSample[] = [];
  private estimate: ClockEstimate | null = null;
  private disagreeing: SyncSample[] = [];

  constructor(
    private readonly keep = 30,
    private readonly best = 5,
  ) {}

  /** Record one ping/pong exchange. Returns the updated estimate. */
  add(t0: number, t1: number, t2: number): ClockEstimate | null {
    const rtt = t2 - t0;
    if (!(rtt >= 0) || rtt > 5000) return this.estimate; // nonsense or hopelessly slow
    const sample = { rtt, offset: t1 - (t0 + t2) / 2, at: t2 };

    // ...the other clock has changed underneath us (e.g. the phone page was reloaded, which
    // restarts its clock). Throw the old samples away and start again from the new ones.
    if (this.estimate && Math.abs(sample.offset - this.estimate.offset) > JUMP_MS + rtt) {
      this.disagreeing.push(sample);
      if (this.disagreeing.length < JUMP_STREAK) return this.estimate;
      this.samples = this.disagreeing;
      this.disagreeing = [];
    } else {
      this.disagreeing = [];
      this.samples.push(sample);
    }
    if (this.samples.length > this.keep) this.samples.shift();

    const fastest = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, this.best);
    this.estimate = {
      offset: median(fastest.map((s) => s.offset)),
      rtt: fastest[0].rtt,
      uncertainty: Math.max(...fastest.map((s) => s.rtt)) / 2,
      samples: this.samples.length,
    };
    return this.estimate;
  }

  get current(): ClockEstimate | null {
    return this.estimate;
  }

  /** Most recent round trip (not the best), for a live "latency" display. */
  get lastRtt(): number | null {
    return this.samples.length ? this.samples[this.samples.length - 1].rtt : null;
  }

  /** Convert a phone-clock time to laptop-clock time. */
  toLocal(remoteT: number): number | null {
    return this.estimate ? remoteT - this.estimate.offset : null;
  }

  reset() {
    this.samples = [];
    this.disagreeing = [];
    this.estimate = null;
  }
}
