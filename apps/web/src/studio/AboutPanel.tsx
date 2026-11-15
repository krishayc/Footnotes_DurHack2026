/**
 * About and research: what Footnotes is (and isn't), the sources behind it, and its honest
 * limits. Every figure here was checked against the source's abstract; anything we could not
 * check says "to verify".
 */
import { useEffect } from 'react';
import { DAPHNET_RESULTS } from '@footnotes/shared';

interface Source {
  cite: string;
  url: string;
  used: string;
  checked: string;
}

const SOURCES: Source[] = [
  {
    cite: 'Ye X, Li L, He R, Jia Y, Poon W. Rhythmic auditory stimulation promotes gait recovery in Parkinson’s patients: a systematic review and meta-analysis. Frontiers in Neurology 13:940419 (2022).',
    url: 'https://doi.org/10.3389/fneur.2022.940419',
    used: 'Why a steady beat: 18 randomised controlled trials, 774 people; RAS improved stride length and gait speed and reduced freezing compared with controls.',
    checked: 'Checked against the abstract.',
  },
  {
    cite: 'Moore ST, MacDougall HG, Ondo WG. Ambulatory monitoring of freezing of gait in Parkinson’s disease. Journal of Neuroscience Methods 167(2):340–348 (2008).',
    url: 'https://doi.org/10.1016/j.jneumeth.2007.08.023',
    used: 'The freeze index: power in the 3–8 Hz “freeze” band ÷ power in the 0.5–3 Hz locomotion band.',
    checked: 'Definition checked against the abstract.',
  },
  {
    cite: 'Bächlin M, Plotnik M, Roggen D, Maidan I, Hausdorff JM, Giladi N, Tröster G. Wearable assistant for Parkinson’s disease patients with the freezing of gait symptom. IEEE Trans. Inf. Technol. Biomed. 14(2):436–446 (2010).',
    url: 'https://doi.org/10.1109/TITB.2009.2036165',
    used: 'The Daphnet dataset (10 patients, 237 freezes) and the baseline we compare with: 73.1% sensitivity, 81.6% specificity online.',
    checked: 'Checked against the preprint shipped with the dataset.',
  },
  {
    cite: 'Daphnet Freezing of Gait dataset, UCI Machine Learning Repository (CC BY 4.0).',
    url: 'https://archive.ics.uci.edu/dataset/245/daphnet+freezing+of+gait',
    used: 'Our freeze detector test and the replay clips.',
    checked: 'Format checked after download: 64 Hz, ankle/thigh/trunk, annotations 0/1/2.',
  },
];

export function AboutPanel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const a = DAPHNET_RESULTS.ankle;
  const t = DAPHNET_RESULTS.thigh;
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <div className="hood" role="dialog" aria-modal="true" aria-labelledby="about-h">
      <div className="hood__head">
        <h2 id="about-h">About and research</h2>
        <button type="button" className="modebar__btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="hood__grid">
        <section className="panel hood__wide" aria-labelledby="what-h">
          <h2 id="what-h" className="panel__h">
            What this is
          </h2>
          <p className="panel__p">
            <strong>A research-informed prototype, not a medical device.</strong> It does not treat
            Parkinson&apos;s or prevent falls. It takes a well-studied technique, walking to a
            steady beat (Rhythmic Auditory Stimulation), and turns the beat into music that grows
            when the walker locks in and simplifies when they don&apos;t. The beat itself never
            chases the walker.
          </p>
          <p className="panel__p">
            Our part is the combination: a stable RAS cue, music arranged live from how in step the
            walker is, a calm recovery motif for freezes, and a visual score of the walk. Adaptive
            music for Parkinson&apos;s has been explored before; we don&apos;t claim it is new on
            its own.
          </p>
        </section>

        <section className="panel hood__wide" aria-labelledby="src-h">
          <h2 id="src-h" className="panel__h">
            Sources
          </h2>
          <ul className="sources">
            {SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.cite}
                </a>
                <p className="panel__p panel__p--sm">
                  {s.used} <em>{s.checked}</em>
                </p>
              </li>
            ))}
            <li>
              <span>Cue tempo relative to the walker&apos;s own pace</span>
              <p className="panel__p panel__p--sm">
                Studies use a range, from below preferred cadence to roughly 5–25% above it, with no
                single best value. <em>To verify.</em> We default to +5%, adjustable 0 to +15%, and
                cap the demo beat at 100 BPM (our choice, not a study figure).
              </p>
            </li>
          </ul>
        </section>

        <section className="panel hood__wide" aria-labelledby="lim-h">
          <h2 id="lim-h" className="panel__h">
            Honest limits
          </h2>
          <ul className="limits">
            <li>
              A phone in a pocket is not an ankle sensor. On real patient data our freeze detector
              catches {pct(a.windowSensitivity)} of freeze time at the ankle but the thigh (nearest
              a pocket) leaves only {pct(t.windowSpecificity)} of normal walking alone, and every
              position gives far too many false alarms for daily life ({a.falseAlarmsPerHour}+ an
              hour). So live phone freeze detection is experimental and off by default.
            </li>
            <li>
              Step detection is tuned on simulated walks and a few real ones, not on people with
              Parkinson&apos;s. Shuffling, very short steps and walking aids are untested.
            </li>
            <li>
              The music runs on the laptop for this demo. Real use would need it on the phone, with
              wired headphones (Bluetooth adds a delay that throws the timing off).
            </li>
            <li>Not tested with patients or physiotherapists: co-design is the next step.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
