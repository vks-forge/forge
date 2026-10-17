/**
 * AgentConflictBanner: "these agents changed since you opened this one."
 *
 * Why: two tabs, or a person and a project's settings, can save agents at the same time. The
 *   server refuses the second save with 409 rather than overwrite (compare-and-swap), and the
 *   screen turns that into a choice: reload the latest and lose the edits (which the owner can
 *   see were unsaved), or keep their edits on top of the latest version after seeing which
 *   fields the other save touched. Saving stays paused until they choose, and nothing is ever
 *   saved over the newer version on its own.
 *
 * Exports: AgentConflictBanner.
 * Depends on: react, lucide-react, components/ui/button.
 */

import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '#/components/ui/button.js';

export function AgentConflictBanner(props: {
  from: number;
  to: number;
  changed: readonly string[];
  /** Whether "keep my edits" makes sense (an agent that still exists). */
  canKeep: boolean;
  onReload: () => void;
  onKeep: () => void;
}) {
  const [review, setReview] = useState(false);

  return (
    <div
      role="alert"
      className="grid gap-3 rounded-xl border border-attn bg-attn-soft p-4 text-sm"
    >
      <p className="flex items-start gap-2 font-medium">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          These agents changed since you opened this one: you started from version{' '}
          {props.from}
          {props.to === props.from ? '' : `, the latest is version ${props.to}`}. Saving
          is paused so nothing is overwritten.
        </span>
      </p>
      {review ? (
        <p className="rounded-lg bg-surface p-3">
          {props.changed.length > 0
            ? `The newer version changed: ${props.changed.join(', ')}.`
            : 'The newer version did not change this agent’s own fields.'}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="quiet" aria-expanded={review} onClick={() => setReview(!review)}>
          {review ? 'Hide their changes' : 'Review their changes'}
        </Button>
        <Button variant="quiet" onClick={props.onKeep} disabled={!props.canKeep}>
          Keep my edits on the latest
        </Button>
        <Button variant="primary" onClick={props.onReload}>
          Reload latest and discard my edits
        </Button>
      </div>
    </div>
  );
}
