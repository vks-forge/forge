/**
 * AgentSaveBar: the sticky strip that saves an agent as the next version of its scope.
 *
 * Why: an agent save is a numbered, attributed version, so the owner says why (3 to 500
 *   characters; the history shows it) and sees which version they are saving over. The bar tells
 *   the truth about every state: nothing changed, why Save is held (a missing reason, a newer
 *   version), saving in flight, the fields that need fixing after a try, the server's refusal in
 *   plain words, and the saved version once it lands. Discard puts the form back to what was
 *   saved, which is the undo for an edit session.
 *
 * Exports: AgentSaveBar.
 * Depends on: components/ui/button, components/ui/field, state/use-agent-editor (limits).
 */

import { Button } from '#/components/ui/button.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { REASON_MAX } from '#/state/use-agent-editor.js';

export function AgentSaveBar(props: {
  creating: boolean;
  /** A project's override of a company agent. */
  override: boolean;
  version: number;
  dirty: boolean;
  reason: string;
  onReason: (reason: string) => void;
  hold: string | null;
  saving: boolean;
  issueCount: number;
  error: { title: string; detail: string } | null;
  saved: string | null;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface px-4 py-3 sm:mx-0 sm:rounded-xl sm:border">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-4">
        <div className="grid gap-1.5">
          <p className="text-xs text-muted">
            {props.creating
              ? 'New agent, not saved yet'
              : props.version === 0
                ? 'Nothing saved yet'
                : `Saving over version ${props.version}`}
          </p>
          {props.dirty ? (
            <>
              <label htmlFor="agent-save-reason" className="sr-only">
                Reason for this change
              </label>
              <input
                id="agent-save-reason"
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
              {props.creating
                ? 'Create agent'
                : props.override
                  ? 'Save override'
                  : 'Save agent'}
            </Button>
          </div>
        ) : null}
      </div>
      {props.dirty && props.hold ? (
        <p className="mt-2 text-xs text-muted">{props.hold}</p>
      ) : null}
      {props.issueCount > 0 ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {props.issueCount === 1
            ? 'One field needs fixing before this can be saved.'
            : `${props.issueCount} fields need fixing before this can be saved.`}
        </p>
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
