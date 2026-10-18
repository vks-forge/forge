/**
 * `useProposalAnswers()`: approve and reject a proposal from any memory screen.
 *
 * Why: a proposal can be answered from the list and from its own record page, and both must
 *   behave the same: a confirm first (the answer cannot be undone), a required reason to
 *   reject, one line of confirmation, and, when the server refuses (already answered in another
 *   tab, Forge down), a plain "Not saved" message with the reason. One hook owns that flow so
 *   the two screens cannot drift apart.
 *
 * Exports: useProposalAnswers().
 * Depends on: react, api/use-memory, api/describe-error, components/ui/button,
 *   routes/memory/answer-dialogs, state/notify/notify-context.
 */

import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useAnswerProposal } from '#/api/use-memory.js';
import { Button } from '#/components/ui/button.js';
import { ApproveDialog, RejectDialog } from '#/routes/memory/answer-dialogs.js';
import { useNotify } from '#/state/notify/notify-context.js';
import type { MemoryAnswer } from '#/types/memory.types.js';

export function useProposalAnswers(
  slug: string,
  statementOf: (id: string) => string | null,
): {
  askApprove: (id: string) => void;
  askReject: (id: string) => void;
  /** The "Not saved" banner; null while there is nothing to say. */
  banner: ReactNode;
  /** Both confirm dialogs; render once. */
  dialogs: ReactNode;
} {
  const answer = useAnswerProposal(slug);
  const notify = useNotify();
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  function send(body: MemoryAnswer): void {
    answer.mutate(body, {
      onSuccess: () =>
        body.verdict === 'approve'
          ? notify.success(`${body.id} approved`, {
              description: 'It is now a decision.',
            })
          : notify.success(`${body.id} rejected`, {
              description: 'The rejection is recorded.',
            }),
    });
  }

  const banner = answer.isError ? (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
    >
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        Not saved, the list was put back.{' '}
        {answer.error instanceof Error ? describeError(answer.error).detail : ''}
      </span>
      <Button variant="quiet" onClick={() => answer.reset()}>
        Dismiss
      </Button>
    </div>
  ) : null;

  const dialogs = (
    <>
      <ApproveDialog
        statement={approving === null ? null : (statementOf(approving) ?? approving)}
        onCancel={() => setApproving(null)}
        onConfirm={() => {
          if (approving) {
            send({ id: approving, verdict: 'approve' });
          }

          setApproving(null);
        }}
      />
      <RejectDialog
        statement={rejecting === null ? null : (statementOf(rejecting) ?? rejecting)}
        onCancel={() => setRejecting(null)}
        onConfirm={(reason) => {
          if (rejecting) {
            send({ id: rejecting, verdict: 'reject', reason });
          }

          setRejecting(null);
        }}
      />
    </>
  );

  return { askApprove: setApproving, askReject: setRejecting, banner, dialogs };
}
