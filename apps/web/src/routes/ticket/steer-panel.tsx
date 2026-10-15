/**
 * SteerPanel: "Message the Worker", under the live thread of a running ticket.
 *
 * Why: a Worker can be redirected while it runs (d-0109), and the person watching its thread
 *   is the one who notices it going the wrong way. The box sits right under the thread it
 *   steers, only while the run is live. The message shows up in the thread itself as the user's
 *   line when the server stores it; this panel only confirms delivery. A refusal says why in
 *   plain words (the run ended, the harness cannot take messages, Forge is shutting down) and
 *   the words stay in the box (state/message-draft). Ctrl+Enter sends.
 *
 * Exports: SteerPanel.
 * Depends on: react, api/use-steer, components/card/message-composer, domain/owner,
 *   domain/steer-errors, state/message-draft.
 */

import { useSteerRun } from '#/api/use-steer.js';
import { MessageComposer } from '#/components/card/message-composer.js';
import { OWNER } from '#/domain/owner.js';
import { describeSteerError } from '#/domain/steer-errors.js';
import { runDraftKey } from '#/state/message-draft.js';

export function SteerPanel(props: { runId: string }) {
  const steer = useSteerRun(props.runId);

  return (
    <div className="grid gap-2 rounded-xl border border-line bg-surface p-3">
      <MessageComposer
        id={`steer-${props.runId}`}
        label="Message the Worker"
        draftKey={runDraftKey(props.runId)}
        sendLabel="Send to Worker"
        placeholder="Tell the Worker what to do differently"
        hint="Delivered to the running Worker now, and shown in the thread. Ctrl+Enter sends."
        sending={steer.isPending}
        error={steer.isError ? describeSteerError(steer.error) : null}
        onSend={(message, clear) =>
          steer.mutate({ message, author: OWNER }, { onSuccess: clear })
        }
      />
      {steer.isSuccess && !steer.isPending ? (
        <p role="status" className="text-sm text-muted">
          Delivered. The Worker will see it on its next turn.
        </p>
      ) : null}
    </div>
  );
}
