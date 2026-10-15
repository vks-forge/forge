/**
 * StageTrack: five segments showing how far a ticket is from done.
 *
 * Why: a list of tickets with status words makes the owner read each one. A short track makes
 *   progress comparable at a glance: filled segments are passed stages, the current one is
 *   the signal colour, or amber when the ticket waits on a person (the only use of amber).
 *   The track is a picture of one fact, so it is exposed to assistive tech as a single image
 *   with the stage in words, and the stage name is also printed beside it, so colour is never
 *   the only carrier.
 *
 * Exports: StageTrack.
 * Depends on: domain/ticket-stage.
 */

import { STAGES } from '#/domain/ticket-stage.js';

export function StageTrack(props: { stage: number; needsYou: boolean }) {
  const name = STAGES[props.stage] ?? STAGES[0];

  return (
    <div className="flex items-center gap-2">
      <ol
        role="img"
        aria-label={`Stage ${props.stage + 1} of ${STAGES.length}: ${name}${props.needsYou ? ', waiting on you' : ''}`}
        className="flex w-32 gap-1"
      >
        {STAGES.map((stage, index) => {
          const tone =
            index < props.stage
              ? 'bg-signal'
              : index === props.stage
                ? props.needsYou
                  ? 'bg-attn'
                  : 'bg-signal'
                : 'bg-hover';

          return <li key={stage} className={`h-1.5 flex-1 rounded-full ${tone}`} />;
        })}
      </ol>
      <span className="text-xs text-muted">{name}</span>
    </div>
  );
}
