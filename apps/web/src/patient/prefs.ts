/** The patient's settings, kept on the phone. */
import { Store, loadJSON, saveJSON } from '../shared/store';

export interface Prefs {
  /** How far above their natural pace the beat sits (0 to 0.15). */
  offset: number;
  voice: boolean;
  textSize: 'large' | 'xl';
  /** How long to press and hold to stop a walk, ms. */
  holdMs: number;
  /** First-run walkthrough seen. */
  welcomed: boolean;
}

const KEY = 'footnotes.prefs.v1';
export const prefs = new Store<Prefs>(
  loadJSON<Prefs>(KEY, {
    offset: 0.05,
    voice: true,
    textSize: 'large',
    holdMs: 2000,
    welcomed: false,
  }),
);

const apply = () => {
  const p = prefs.get();
  saveJSON(KEY, p);
  document.documentElement.dataset.textSize = p.textSize;
};
prefs.subscribe(apply);
apply();
