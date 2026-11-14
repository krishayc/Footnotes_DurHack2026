import { useSyncExternalStore } from 'react';
import { motion, type MotionSnapshot } from './motion';

/** React view of the motion sensor (updates ~4 times a second, not on every sample). */
export function useMotion(): MotionSnapshot {
  return useSyncExternalStore(motion.subscribe, motion.getSnapshot);
}
