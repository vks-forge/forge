/**
 * SaveBar: the sticky strip that saves a new version of the settings.
 *
 * Why: saving creates version N+1 and is the only moment settings reach Workers, so the bar
 *   says which version you are editing, who saved it and when, asks for a reason (the history
 *   needs one, and the server refuses a save without), and states plainly why Save is held
 *   (nothing changed, a field is invalid, you are offline, a newer version exists). It stays
 *   in view while the long form scrolls. While nothing is changed it shows only the version.
 *
 * Exports: SaveBar.
 * Depends on: lucide-react, domain/format-time, components/ui/{button,field}.
 */

import type { ConfigVersion } from '@forge/core';
import { Button } from '#/components/ui/button.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { formatWhen } from '#/domain/format-time.js';

export function SaveBar(props: {
  version: number;
  latest: ConfigVersion | undefined;
  dirty: boolean;
  reason: string;
  onReason: (reason: string) => void;
  holdReason: string | null;
  saving: boolean;
  saveError: string | null;
  saved: string | null;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface px-4 py-3 sm:mx-0 sm:rounded-xl sm:border">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-4">
        <div className="grid gap-1.5">
          <p className="text-xs text-muted">
            {props.version === 0 ? 'Nothing saved yet' : `Version ${props.version}`}
            {props.latest ? (
              <>
                {' '}
                · saved by {props.latest.author}{' '}
                <time>{formatWhen(props.latest.created_at)}</time>
              </>
            ) : null}
          </p>
          {props.dirty ? (
            <>
              <label htmlFor="save-reason" className="sr-only">
                Reason for this change
              </label>
              <input
                id="save-reason"
                placeholder="Reason for this change (required)"
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
              disabled={props.holdReason !== null}
              status={props.saving ? 'loading' : 'idle'}
            >
              Save as v{props.version + 1}
            </Button>
          </div>
        ) : null}
      </div>
      {props.dirty && props.holdReason ? (
        <p className="mt-2 text-xs text-muted">{props.holdReason}</p>
      ) : null}
      {props.saveError ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {props.saveError}
        </p>
      ) : null}
      <p role="status" className="mt-2 text-xs text-good empty:hidden">
        {props.saved}
      </p>
    </div>
  );
}
