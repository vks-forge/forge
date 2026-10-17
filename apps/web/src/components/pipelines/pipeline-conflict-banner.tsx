/**
 * PipelineConflictBanner: "these pipelines changed since you opened this one."
 *
 * Why: two tabs, or a person and a colleague, can save pipelines at the same time. The server
 *   refuses the second save with 409 rather than overwrite (compare-and-swap), and the screen
 *   turns that into a choice: reload the latest and lose the edits (which the owner can see were
 *   unsaved), or keep their edits on top of the latest version. Saving stays paused until they
 *   choose, and nothing is ever saved over the newer version on its own. The same banner serves
 *   the routing rules, which are versioned the same way.
 *
 * Exports: PipelineConflictBanner.
 * Depends on: lucide-react, components/ui/button.
 */

import { TriangleAlert } from 'lucide-react';
import { Button } from '#/components/ui/button.js';

export function PipelineConflictBanner(props: {
  subject: string;
  from: number;
  to: number;
  onReload: () => void;
  onKeep: () => void;
}) {
  return (
    <div
      role="alert"
      className="grid gap-3 rounded-xl border border-attn bg-attn-soft p-4 text-sm"
    >
      <p className="flex items-start gap-2 font-medium">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          {`${props.subject} changed since you opened it: you started from version ${props.from}`}
          {props.to === props.from ? '' : `, the latest is version ${props.to}`}. Saving
          is paused so nothing is overwritten.
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="quiet" onClick={props.onKeep}>
          Keep my edits on the latest
        </Button>
        <Button variant="primary" onClick={props.onReload}>
          Reload latest and discard my edits
        </Button>
      </div>
    </div>
  );
}
