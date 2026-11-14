/**
 * A fixed-size ring buffer of accelerometer samples.
 *
 * Why a ring buffer? Motion events arrive 50-100 times a second for as long as the walk lasts.
 * Pushing onto a normal array forever would grow memory and trigger garbage-collection pauses
 * (which show up as stutters in the graph). A ring buffer reuses the same typed arrays: when
 * it is full, the newest sample overwrites the oldest.
 */
export class SampleBuffer {
  readonly capacity: number;
  readonly t: Float64Array; // timestamps, ms (performance.now() clock)
  readonly x: Float32Array; // m/s^2, including gravity
  readonly y: Float32Array;
  readonly z: Float32Array;
  private head = 0; // index where the next sample will be written
  private _count = 0;
  /** Total samples ever pushed (never wraps). Handy for "has anything new arrived?". */
  total = 0;

  constructor(capacity = 4096) {
    this.capacity = capacity;
    this.t = new Float64Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
  }

  get count() {
    return this._count;
  }

  push(t: number, x: number, y: number, z: number) {
    const i = this.head;
    this.t[i] = t;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.head = (i + 1) % this.capacity;
    if (this._count < this.capacity) this._count++;
    this.total++;
  }

  /** Physical index of the k-th most recent sample (k = 0 is the newest). */
  indexFromNewest(k: number): number {
    return (this.head - 1 - k + this.capacity * 2) % this.capacity;
  }

  latestTime(): number | null {
    return this._count ? this.t[this.indexFromNewest(0)] : null;
  }

  /** Calls fn for every sample with time >= since, oldest first. */
  forEachSince(since: number, fn: (i: number) => void) {
    // Walk backwards to find where the window starts, then forwards to visit in order.
    let k = 0;
    while (k < this._count && this.t[this.indexFromNewest(k)] >= since) k++;
    for (let j = k - 1; j >= 0; j--) fn(this.indexFromNewest(j));
  }

  /** Measured sample rate (Hz) over the last `windowMs`. 0 if not enough data. */
  rateHz(windowMs = 2000): number {
    const newest = this.latestTime();
    if (newest === null) return 0;
    let k = 0;
    while (k + 1 < this._count && newest - this.t[this.indexFromNewest(k + 1)] <= windowMs) k++;
    if (k < 2) return 0;
    const span = newest - this.t[this.indexFromNewest(k)];
    return span > 0 ? (k * 1000) / span : 0;
  }

  clear() {
    this.head = 0;
    this._count = 0;
  }
}
