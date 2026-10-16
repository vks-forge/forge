/**
 * DirectorStatus: whether the Director runs on built-in defaults, and the way back to them.
 *
 * Why: the owner needs to know at a glance whether anything on this page differs from what
 *   Forge ships, and a safe way to undo an experiment that went too far. "Reset to default"
 *   does not change anything on the spot: it stages the removal of every saved Director
 *   override and waits for the normal Save, so it becomes a new numbered version (the old ones
 *   stay in the history) and Discard cancels it. A confirmation says what will be lost first.
 *
 * Exports: DirectorStatus.
 * Depends on: react, components/settings/form-field, components/ui/button,
 *   components/ui/confirm-dialog.
 */

import { useState } from 'react';
import { Notice } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';

export function DirectorStatus(props: {
  usingDefaults: boolean;
  resetStaged: boolean;
  onReset: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (props.resetStaged) {
    return (
      <Notice tone="warn" title="Reset to default is ready to save">
        Saving removes every saved Director setting (models, flow, house rules and
        limits), so the built-in defaults apply again. Earlier versions stay in the
        history. Use Discard edits below to keep what you have.
      </Notice>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
      <p role="status" className="text-sm">
        {props.usingDefaults
          ? 'Using built-in defaults.'
          : 'Customised: some Director settings differ from the built-in defaults.'}
      </p>
      <Button disabled={props.usingDefaults} onClick={() => setConfirming(true)}>
        Reset to default
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Reset the Director to its defaults?"
        description="Your Director models, flow, house rules and limits go back to what Forge ships once you save. Nothing is lost: earlier versions stay in the history."
        confirmLabel="Stage the reset"
        onConfirm={() => {
          setConfirming(false);
          props.onReset();
        }}
      />
    </div>
  );
}
