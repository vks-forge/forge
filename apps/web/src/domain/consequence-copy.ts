/**
 * Consequence copy: the plain words of what Re-plan, Cancel ticket and Merge anyway change.
 *
 * Why: the owner confirms these three buttons from a popup, and the popup must say, in the
 *   owner's words, which tickets are held, what is deleted and which check is overruled, from
 *   the live lists the server read. The sentences are chosen once so the card chat, the Ticket
 *   page and the needs-you modal read the same. A mechanical stop (setup, lockfile, generated file)
 *   is named so the popup can point to the cheaper Send back for rework. Pure.
 *
 * Exports: replanWords(), cancelWords(), mergeAnywayWords(), mechanicalWords(), cheaperLine(),
 *   statusWords().
 * Depends on: domain/board-columns, @forge/core (types), types/consequence-ui (types).
 */

import { STATE_LABEL } from '#/domain/board-columns.js';
import type {
  CancelConsequences,
  MergeAnywayConsequences,
  ReplanConsequences,
} from '@forge/core';
import type { ConsequenceWords } from '#/types/consequence-ui.types.js';

/** Where a kept ticket stands, in the words of the board. */
export function statusWords(status: string): string {
  return (STATE_LABEL as Record<string, string>)[status]?.toLowerCase() ?? status;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** What the Re-plan does, line by line. */
export function replanWords(c: ReplanConsequences): ConsequenceWords[] {
  const id = c.ticket.id;
  const lines: ConsequenceWords[] = [
    {
      text: c.ticket_replaced
        ? `${id} stays parked and is replaced when you approve the new plan.`
        : `${id} stays parked.`,
    },
  ];

  if (c.stop !== null) {
    const found =
      c.stop.findings === 0
        ? ''
        : `, with ${c.stop.findings} ${plural(c.stop.findings, 'finding', 'findings')}`;

    lines.push({
      text: `The Director gets why ${id} stopped (${c.stop.summary}${found}) together with your comment.`,
    });
  } else {
    lines.push({ text: 'The Director gets your comment.' });
  }

  lines.push(
    c.held.length === 0
      ? { text: 'No other ticket is waiting to start.' }
      : {
          text: `${c.held.length} ${plural(c.held.length, 'ticket that has', 'tickets that have')} not started ${plural(c.held.length, 'is', 'are')} held until you approve the new plan, then replaced:`,
          tickets: c.held,
        },
  );

  if (c.kept.length > 0) {
    lines.push({
      text: 'These keep running or stay as they are:',
      tickets: c.kept.map((t) => ({ ...t, note: statusWords(t.status) })),
    });
  }

  lines.push({ text: 'You approve the new plan before anything is replaced.' });

  return lines;
}

/** What the Cancel removes, line by line. */
export function cancelWords(c: CancelConsequences): ConsequenceWords[] {
  const lines: ConsequenceWords[] = [];

  if (c.run_active) {
    lines.push({ text: 'The Worker running on it stops now.' });
  }

  if (c.has_worktree || c.branch !== null) {
    lines.push({
      text: `Its working folder and its local branch${c.branch === null ? '' : ` (${c.branch})`} are deleted.`,
    });
  }

  if (c.pr_number !== null) {
    lines.push({
      text: `Pull request #${c.pr_number} is closed and its pushed branch deleted.`,
    });
  }

  lines.push({
    text: 'The last commit id stays on the card, so the work can be brought back from git until it collects it.',
  });

  if (c.dependents.length > 0) {
    lines.push({
      text: `${c.dependents.length} ${plural(c.dependents.length, 'ticket waits', 'tickets wait')} on it and would be cancelled too:`,
      tickets: c.dependents,
    });
  }

  return lines;
}

/** What Merge anyway overrules and where the work goes next. */
export function mergeAnywayWords(c: MergeAnywayConsequences): ConsequenceWords[] {
  const lines: ConsequenceWords[] = c.overruled.map((o) => {
    const counts = (['critical', 'high', 'medium', 'low'] as const)
      .filter((s) => (o.counts[s] ?? 0) > 0)
      .map((s) => `${o.counts[s]} ${s}`)
      .join(', ');

    return {
      text: `Overrules ${o.stage_label}${counts === '' ? '' : `: ${counts}`}. ${o.findings
        .map((f) => `${f.where === null ? '' : `${f.where} `}${f.issue}`)
        .join('; ')}`.trim(),
    };
  });

  if (lines.length === 0) {
    lines.push({ text: 'Overrules the check that is holding this ticket.' });
  }

  lines.push({
    text: `The ticket then goes on to sign-off and merges${c.branch === null ? '' : ` ${c.branch}`}${c.pr_number === null ? '' : ` (pull request #${c.pr_number})`} into the main branch. The gates and the final checks still apply.`,
  });

  lines.push({ text: 'A merge cannot be undone from Forge.' });

  return lines;
}

const MECHANICAL: Readonly<Record<'setup' | 'lockfile' | 'generated', string>> = {
  setup: 'a setup or install problem',
  lockfile: 'a lockfile problem',
  generated: 'a generated-file problem',
};

/** Names the mechanical kind of a stop. */
export function mechanicalWords(kind: 'setup' | 'lockfile' | 'generated'): string {
  return `This looks like ${MECHANICAL[kind]}, not a problem with the plan.`;
}

/** The cheaper way, said with the button's own name. */
export function cheaperLine(label: string): string {
  return `${label} fixes this without re-planning.`;
}
