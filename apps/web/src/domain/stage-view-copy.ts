/**
 * Stage view copy: the words of the ticket's pipeline strip and its stage detail.
 *
 * Why: the strip is the owner's quick answer to "where is this ticket and why". Each status needs
 *   a word that is true to what the engine means by it (a failed stage that sent work back is not
 *   the same as one waiting for the owner), a ticket that reached a rework needs "Rework 1 of 2"
 *   so the cap is never a surprise, and an artifact needs a name that says whose words it holds,
 *   above all the Worker's own account, which a reviewer never sees. Pure.
 *
 * Exports: STATUS_VIEW, stageWords(), overrideLine(), ACCEPTANCE_WORDS, reworkBadge(),
 *   countsLine(), artifactLabel(), NARRATIVE_NOTE, NOT_STARTED, ruleFor(), findStage().
 * Depends on: domain/escalation-copy, schemas/pipelines. No IO.
 */

import { settledWords } from '#/domain/escalation-copy.js';
import type { StageView, TicketPipelineView } from '#/schemas/pipelines.js';
import type { StageStatus, StageTone } from '#/types/pipeline-ui.types.js';

export const STATUS_VIEW: Readonly<
  Record<StageStatus, { label: string; tone: StageTone }>
> = {
  pending: { label: 'Not yet', tone: 'quiet' },
  running: { label: 'Running', tone: 'signal' },
  passed: { label: 'Passed', tone: 'good' },
  failed: { label: 'Failed', tone: 'danger' },
  error: { label: 'Could not run', tone: 'danger' },
  waiting: { label: 'Waiting for you', tone: 'attn' },
  skipped: { label: 'Skipped', tone: 'quiet' },
  adopted: { label: 'Done earlier', tone: 'good' },
};

/**
 * The status word of a chip. The sign-off and Director-check rows say more than "Passed": who
 * signed, or why a check did not run.
 */
export function stageWords(stage: StageView): { label: string; tone: StageTone } {
  const base = STATUS_VIEW[stage.status];

  if (stage.kind === 'sign_off' && stage.status === 'passed') {
    return {
      label: stage.signed_by === 'director' ? 'Signed by the Director' : 'Signed by you',
      tone: base.tone,
    };
  }

  if (stage.kind === 'director_check' && stage.status === 'skipped') {
    return { label: 'No plan to check against', tone: base.tone };
  }

  return base;
}

/** "Merged anyway by you: it is a typo fix": what the owner overruled and why. */
export function overrideLine(override: NonNullable<StageView['override']>): string {
  return `${settledWords(override.action, override.by)}: ${override.comment}`;
}

export const ACCEPTANCE_WORDS = {
  yes: 'Met',
  no: 'Not met',
  unclear: 'Unclear',
} as const;

/** A stage by id, looking inside groups. */
export function findStage(
  stages: readonly StageView[],
  id: string,
): StageView | undefined {
  for (const stage of stages) {
    if (stage.id === id) {
      return stage;
    }

    const inner = stage.members === undefined ? undefined : findStage(stage.members, id);

    if (inner !== undefined) {
      return inner;
    }
  }

  return undefined;
}

export const NOT_STARTED = 'Starts when the ticket is dispatched.';

export const NARRATIVE_NOTE =
  'The Worker’s own account. Reviewers never see it, so their findings do not lean on it.';

/** "Rework 1 of 2", or nothing before the first rework. */
export function reworkBadge(rework: TicketPipelineView['rework']): string | null {
  return rework.count === 0 ? null : `Rework ${rework.count} of ${rework.cap}`;
}

/** "2 high, 1 low", or `null` when nothing was found. */
export function countsLine(counts: StageView['counts']): string | null {
  if (counts === undefined) {
    return null;
  }

  const parts = (['critical', 'high', 'medium', 'low'] as const)
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`);

  return parts.length === 0 ? 'No findings' : parts.join(', ');
}

const ARTIFACTS: Readonly<Record<string, string>> = {
  plan: 'Plan',
  ticket: 'Ticket',
  diff: 'Diff',
  finish_claims: 'Worker’s claims',
  narrative: 'Worker’s own account',
  test_report: 'Test report',
  findings: 'Earlier findings',
  gate_report: 'Gate report',
  check_report: 'Director check report',
};

export const artifactLabel = (kind: string): string => ARTIFACTS[kind] ?? kind;

/** The rule that added stage `stageId` to this ticket, if one did. */
export function ruleFor(
  routed: TicketPipelineView['routed'],
  stageId: string,
): TicketPipelineView['routed'][number] | undefined {
  return routed.find((r) => r.stage_id === stageId);
}
