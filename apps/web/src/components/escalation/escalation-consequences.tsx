/**
 * ConsequenceList: what a far-reaching action would change, listed in a confirmation popup.
 *
 * Why: Re-plan, Cancel ticket and Merge anyway reach beyond the ticket they sit on, and "are you
 *   sure?" does not say how. The popup lists the real effect from live data (which tickets are
 *   held, what is deleted, which check is overruled) in plain words, so the owner decides on
 *   facts. While the read is under way it says so, and when it fails it says that too and lets
 *   the generic words stand: a broken preview must not remove the way forward. For a mechanical
 *   stop it names the cheaper action with its own button.
 *
 * Exports: ConsequenceList.
 * Depends on: components/ticket/ticket-link, components/ui/button, domain/consequence-copy,
 *   types/consequence-ui.types.
 */

import { TicketLink } from '#/components/ticket/ticket-link.js';
import { Button } from '#/components/ui/button.js';
import {
  cancelWords,
  cheaperLine,
  mechanicalWords,
  mergeAnywayWords,
  replanWords,
} from '#/domain/consequence-copy.js';
import type {
  CheaperAction,
  ConsequenceRead,
  ConsequenceWords,
} from '#/types/consequence-ui.types.js';

function wordsOf(data: NonNullable<ConsequenceRead['data']>): ConsequenceWords[] {
  if (data.action === 'replan') {
    return replanWords(data);
  }

  return data.action === 'cancel' ? cancelWords(data) : mergeAnywayWords(data);
}

export function ConsequenceList(props: {
  read: ConsequenceRead;
  cheaper?: CheaperAction | undefined;
}) {
  const { read, cheaper } = props;

  if (read.isPending) {
    return (
      <p role="status" className="text-sm text-muted">
        Checking what this changes…
      </p>
    );
  }

  if (read.isError || read.data === undefined) {
    return (
      <p className="text-sm text-muted">
        Could not list what this changes. It works as described above.
      </p>
    );
  }

  const { data } = read;

  return (
    <div className="grid gap-3">
      {data.action === 'replan' && data.mechanical !== null && cheaper !== undefined ? (
        <div className="grid gap-2 rounded-lg border border-line bg-rail p-3 text-sm">
          <p>
            {mechanicalWords(data.mechanical.kind)} {cheaperLine(cheaper.label)}
          </p>
          <div>
            <Button onClick={cheaper.onUse}>{cheaper.label}</Button>
          </div>
        </div>
      ) : null}
      <ul aria-label="What this changes" className="grid gap-2 text-sm">
        {wordsOf(data).map((line) => (
          <li key={line.text} className="grid min-w-0 gap-1">
            <span>{line.text}</span>
            {line.tickets === undefined ? null : (
              <ul className="grid gap-0.5 pl-4">
                {line.tickets.map((t) => (
                  <li key={t.id} className="min-w-0 break-words">
                    <TicketLink id={t.id} />{' '}
                    <span className="text-muted">
                      {t.title}
                      {t.note === undefined ? '' : ` (${t.note})`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
