/**
 * How the phone counts steps, switchable from the laptop. A phone in one front pocket may
 * feel every step (each bump = one step), or mostly the leg it's on (each bump = a stride =
 * two steps). We can't reliably tell a slow two-leg walk from a fast one-leg walk, so a person
 * chooses, with plain-words guidance based on how the beat feels.
 */
import type { StudioLink, StudioLinkSnapshot } from './link';

export function PhoneCounting({ link, snap }: { link: StudioLink; snap: StudioLinkSnapshot }) {
  const mode = snap.phone?.legMode ?? 'both';
  const pace = snap.phone?.cadenceSpm;
  return (
    <section className="panel" aria-labelledby="count-h">
      <h2 id="count-h" className="panel__h">
        How the phone counts
      </h2>
      <div className="seg seg--dark" role="group" aria-label="Each bump the phone feels is">
        <button
          type="button"
          className="seg__btn"
          aria-pressed={mode !== 'one'}
          onClick={() => link.setPhoneLegMode('both')}
        >
          Each bump = 1 step
        </button>
        <button
          type="button"
          className="seg__btn"
          aria-pressed={mode === 'one'}
          onClick={() => link.setPhoneLegMode('one')}
        >
          Each bump = 2 steps
        </button>
      </div>
      <p className="panel__p panel__p--sm">
        If the beat feels <strong>twice as fast</strong> as your steps, choose 1 step. If it feels{' '}
        <strong>half as fast</strong> (two steps per beat), choose 2 steps. Then find the pace
        again.
        {pace ? ` The phone reads ${Math.round(pace)} steps a minute right now.` : ''}
      </p>
    </section>
  );
}
