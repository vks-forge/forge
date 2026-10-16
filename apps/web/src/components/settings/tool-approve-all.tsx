/**
 * ToolApproveAll: one confirm to approve every tool that is waiting on the owner.
 *
 * Why: after a harness update several built-in tools can change at once (the owner sees
 *   "Approve write, task, shell, read, grep" from Home). Approving them one by one repeats the
 *   same name-and-reason dialog five times. This button opens the same confirm once, names every
 *   tool it will approve, and records the same author and reason against each. The decisions go
 *   out one at a time, so a refusal part-way leaves the earlier tools approved (each is its own
 *   audited record) and the dialog open with the server's message; the list is refetched so the
 *   screen shows what actually changed.
 *
 * Exports: ToolApproveAll.
 * Depends on: react, @tanstack/react-query, api/api-provider, api/describe-error,
 *   api/use-settings-data, components/settings/decision-dialog, components/ui/button,
 *   schemas/settings, state/use-submit.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForgeApi } from '#/api/api-provider.js';
import { describeError } from '#/api/describe-error.js';
import { toolsKey } from '#/api/use-settings-data.js';
import { DecisionDialog } from '#/components/settings/decision-dialog.js';
import { Button } from '#/components/ui/button.js';
import type { DecisionForm } from '#/schemas/settings.js';
import { useSubmit } from '#/state/use-submit.js';

export function ToolApproveAll(props: { id: string; pending: readonly string[] }) {
  const { id } = props;
  const api = useForgeApi();
  const queryClient = useQueryClient();
  // The names are fixed when the dialog opens, so a refetch after a partial failure cannot
  // change what the title and the confirm button promise.
  const [asked, setAsked] = useState<readonly string[] | null>(null);

  const approve = useSubmit(async (tools: readonly string[], form: DecisionForm) => {
    try {
      for (const tool of tools) {
        await api.harnesses.decideTool(id, tool, 'approve', form);
      }
    } finally {
      await queryClient.invalidateQueries({ queryKey: toolsKey(id) });
    }

    return true;
  });

  return (
    <>
      {props.pending.length >= 2 ? (
        <div className="mt-3">
          <Button
            variant="primary"
            onClick={() => {
              approve.reset();
              setAsked([...props.pending]);
            }}
          >
            Approve all ({props.pending.length})
          </Button>
        </div>
      ) : null}
      <DecisionDialog
        open={asked !== null}
        title={`Approve ${asked?.length ?? 0} tools?`}
        description={`Workers will be allowed to use ${(asked ?? []).join(', ')} with their current schemas.`}
        confirmLabel={`Approve ${asked?.length ?? 0} tools`}
        tone="primary"
        pending={approve.pending}
        error={
          approve.status === 'error' ? describeError(approve.error).detail : undefined
        }
        onCancel={() => setAsked(null)}
        onConfirm={(form) => {
          if (asked) {
            void approve.run(asked, form).then((done) => {
              if (done) {
                setAsked(null);
              }
            });
          }
        }}
      />
    </>
  );
}
