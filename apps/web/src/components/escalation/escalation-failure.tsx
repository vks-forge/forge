/**
 * EscalationFailure: what went wrong with a ticket, what was already tried, and why it is the
 * owner's call.
 *
 * Why: a stopped ticket is only useful to the owner if they can tell, at a glance, whether to
 *   retry, change the plan or give up. So the card states the problem in one sentence, adds the
 *   Director's diagnosis when it had one, and keeps the attempts (what was tried and how it ended)
 *   one click away rather than in the way. The buttons are the shared action bar.
 *
 *   A merge-conflict stop also lists the files that clash and who changed them first, so the owner
 *   can choose without opening git.
 *
 * Exports: EscalationFailure.
 * Depends on: lucide-react, react-router, components/escalation/escalation-setup (safeHref), domain/escalation-copy,
 *   domain/conflict-copy, domain/turn-limit-copy, types/escalation-ui.types.
 */

import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { safeHref } from '#/components/escalation/escalation-setup.js';
import { conflictHelp, upstreamLine, visibleFiles } from '#/domain/conflict-copy.js';
import { failureHelp } from '#/domain/escalation-copy.js';
import { turnLimitHelp } from '#/domain/turn-limit-copy.js';
import type { FailurePayload } from '#/types/escalation-ui.types.js';

/** What to raise and where, with the setting in bold and its screen as a link; Retry is the next step. */
function TurnLimitLine(props: { limit: NonNullable<FailurePayload['limit']> }) {
  const help = turnLimitHelp(props.limit);

  return (
    <p className="min-w-0 break-words text-sm">
      {help.lead}
      <strong className="font-semibold">{help.setting}</strong>
      {help.mid}
      <Link to={safeHref(help.href)} className="font-medium text-signal underline">
        {help.linkText}
      </Link>
      {help.tail}
    </p>
  );
}

const FILE_CLASS = 'min-w-0 break-all font-data text-xs';

/** The files that clash (the first few, the rest behind a count) and the changes that merged first. */
function ConflictLists(props: { conflict: NonNullable<FailurePayload['conflict']> }) {
  const { shown, hidden } = visibleFiles(props.conflict.files);

  return (
    <div className="grid gap-2 text-sm">
      {props.conflict.files.length > 0 ? (
        <div className="grid gap-1">
          <p className="font-medium">Files that clash</p>
          <ul className="grid gap-0.5 border-l-2 border-line pl-3">
            {shown.map((file) => (
              <li key={file} className={FILE_CLASS}>
                {file}
              </li>
            ))}
          </ul>
          {hidden.length > 0 ? (
            <details className="group">
              <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-lg text-muted hover:text-fg">
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-150 group-open:rotate-90"
                />
                Show {hidden.length} more {hidden.length === 1 ? 'file' : 'files'}
              </summary>
              <ul className="mt-1 grid gap-0.5 border-l-2 border-line pl-3">
                {hidden.map((file) => (
                  <li key={file} className={FILE_CLASS}>
                    {file}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      {props.conflict.upstream.length > 0 ? (
        <div className="grid gap-1">
          <p className="font-medium">Changed first by</p>
          <ul className="grid gap-0.5 border-l-2 border-line pl-3">
            {props.conflict.upstream.map((change) => (
              <li key={change.ref} className="min-w-0 break-words">
                {upstreamLine(change)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function EscalationFailure(props: { failure: FailurePayload }) {
  const { failure } = props;

  return (
    <div className="grid gap-2">
      <p className="min-w-0 whitespace-pre-wrap break-words text-base">
        {failure.summary}
      </p>
      {failure.cause === 'merge_conflict' ? (
        <>
          <p className="min-w-0 break-words text-sm text-muted">
            {conflictHelp(failure.conflict)}
          </p>
          {failure.conflict ? <ConflictLists conflict={failure.conflict} /> : null}
        </>
      ) : null}
      {failureHelp(failure.cause, failure.error_family) ? (
        <p className="min-w-0 break-words text-sm text-muted">
          {failureHelp(failure.cause, failure.error_family)}
        </p>
      ) : null}
      {failure.limit ? <TurnLimitLine limit={failure.limit} /> : null}
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
