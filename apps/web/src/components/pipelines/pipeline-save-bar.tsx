/**
 * PipelineSaveBar: the sticky strip that saves a lane (or a project's routing rules) as the next version.
 *
 * Why: a pipeline save is a numbered, attributed version of its scope's settings, so the owner
 *   says why (3 to 500 characters; the history shows it) and sees which version they are saving
 *   over. The bar tells the truth about every state: nothing changed, why Save is held (a
 *   problem in the list, a missing reason, a newer version), saving in flight, the server's
 *   refusal in plain words, and the saved version once it lands. Discard puts the list back to
 *   what was saved, which is the undo for an edit session. Each lane has its own bar, so the
 *   reason box carries the lane's name for screen readers.
 *
 * Exports: PipelineSaveBar.
 * Depends on: components/ui/button, components/ui/field, state/use-pipeline-editor (limits).
 */

import { Button } from '#/components/ui/button.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { REASON_MAX } from '#/state/use-pipeline-editor.js';

export function PipelineSaveBar(props: {
  /** Makes the reason box's id unique among lanes. */
  idPrefix: string;
  /** What the lane is called, for the accessible names. */
  subject: string;
  saveLabel: string;
  version: number;
  dirty: boolean;
  reason: string;
  onReason: (reason: string) => void;
  hold: string | null;
  saving: boolean;
  error: { title: string; detail: string } | null;
  saved: string | null;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const reasonId = `${props.idPrefix}-reason`;

  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface px-4 py-3 sm:mx-0 sm:rounded-xl sm:border">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-4">
        <div className="grid gap-1.5">
          <p className="text-xs text-muted">
            {props.version === 0
              ? 'Nothing saved yet'
              : `Saving over version ${props.version}`}
          </p>
          {props.dirty ? (
            <>
              <label htmlFor={reasonId} className="sr-only">
                {`Reason for this change to ${props.subject}`}
              </label>
              <input
                id={reasonId}
                placeholder="Reason for this change (required)"
                maxLength={REASON_MAX}
                value={props.reason}
                onChange={(event) => props.onReason(event.target.value)}
                className={INPUT_CLASS}
              />
            </>
          ) : null}
        </div>
        {props.dirty ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="quiet" onClick={props.onDiscard} disabled={props.saving}>
              Discard changes
            </Button>
            <Button
              variant="primary"
              onClick={props.onSave}
              disabled={props.hold !== null}
              status={props.saving ? 'loading' : 'idle'}
            >
              {props.saveLabel}
            </Button>
          </div>
        ) : null}
      </div>
      {props.dirty && props.hold ? (
        <p className="mt-2 text-xs text-muted">{props.hold}</p>
      ) : null}
      {props.error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          <span className="font-medium">{props.error.title}.</span> {props.error.detail}
        </p>
      ) : null}
      <p role="status" className="mt-2 text-xs text-good empty:hidden">
        {props.dirty ? null : props.saved}
      </p>
    </div>
  );
}
