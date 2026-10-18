/**
 * EscalationFailure: what went wrong with a ticket, what was already tried, and why it is the
 * owner's call.
 *
 * Why: a stopped ticket is only useful to the owner if they can tell, at a glance, whether to
 *   retry, change the plan or give up. So the card states the problem in one sentence, adds the
 *   Director's diagnosis when it had one, and keeps the attempts (what was tried and how it ended)
 *   one click away rather than in the way. The buttons are the shared action bar.
 *
 * Exports: EscalationFailure.
 * Depends on: lucide-react, domain/escalation-copy, types/escalation-ui.types.
 */

import { ChevronRight } from 'lucide-react';
import { failureHelp } from '#/domain/escalation-copy.js';
import type { FailurePayload } from '#/types/escalation-ui.types.js';

export function EscalationFailure(props: { failure: FailurePayload }) {
  const { failure } = props;

  return (
    <div className="grid gap-2">
      <p className="min-w-0 whitespace-pre-wrap break-words text-base">
        {failure.summary}
      </p>
      {failureHelp(failure.cause, failure.error_family) ? (
        <p className="min-w-0 break-words text-sm text-muted">
          {failureHelp(failure.cause, failure.error_family)}
        </p>
      ) : null}
      {failure.diagnosis ? (
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm text-muted">
          The Director&apos;s reading: {failure.diagnosis}
        </p>
      ) : null}
      {failure.attempts.length > 0 ? (
        <details className="group text-sm">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-lg text-muted hover:text-fg">
            <ChevronRight
              aria-hidden="true"
              className="size-4 transition-transform duration-150 group-open:rotate-90"
            />
            What was tried ({failure.attempts.length})
          </summary>
          <ol className="mt-1 grid gap-1 border-l-2 border-line pl-3">
            {failure.attempts.map((attempt, index) => (
              <li key={index} className="min-w-0 break-words">
                <span className="font-medium">{attempt.what}</span>
                <span className="text-muted">: {attempt.result}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
