import { useEffect, useState } from 'react';
import { median } from '@footnotes/shared';
import { audio } from './audio/engine';
import { stepBus } from './steps';

export interface StudioStats {
  /** Current pace from the step bus (any source), or null if they've stopped. */
  paceSpm: number | null;
  /**
   * Spread (standard deviation) of the gaps between recent beats, in ms, measured on the audio
   * clock. Should be ~0: proof the beat never wavers.
   */
  beatSpreadMs: number | null;
}

/** Stats that change continuously; recomputed 4 times a second. */
export function useStudioStats(): StudioStats {
  const [stats, setStats] = useState<StudioStats>({ paceSpm: null, beatSpreadMs: null });
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      const steps = stepBus.recent;
      const last = steps[steps.length - 1];
      let paceSpm: number | null = null;
      if (last && now - last.t < 3000) {
        const gaps: number[] = [];
        for (let i = Math.max(1, steps.length - 10); i < steps.length; i++) {
          const g = steps[i].t - steps[i - 1].t;
          if (g > 0 && g < 2500) gaps.push(g);
        }
        if (gaps.length >= 3) paceSpm = 60000 / median(gaps);
      }

      let beatSpreadMs: number | null = null;
      const beats = audio.beats.slice(-16);
      if (audio.state.get().playing && beats.length >= 6) {
        const gaps = beats.slice(1).map((b, i) => (b.audioTime - beats[i].audioTime) * 1000);
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        beatSpreadMs = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
      }
      setStats({ paceSpm, beatSpreadMs });
    }, 250);
    return () => window.clearInterval(id);
  }, []);
  return stats;
}
