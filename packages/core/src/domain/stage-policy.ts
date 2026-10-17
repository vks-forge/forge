/**
 * Stage policy — what counts as blocking, what a reviewer may see, what a legacy ticket adopts.
 *
 * Why: three small rules decide whether a stage's result stops the merge and what the next
 *   agent is shown. A finding blocks when its severity is one the stage lists (default critical
 *   and high); a failed gate blocks always. A check agent never sees the Worker's own narrative,
 *   even if its definition asks for it (d-0070): the Worker's story would talk it into agreeing,
 *   so `narrative` is stripped for every role that is not a writer. And a ticket that was
 *   already past its writers when pipelines went live must not be asked to write again: its
 *   writer stages are recorded as adopted.
 *
 * Exports: DEFAULT_BLOCKING, checkPolicy(), blockingCount(), isBlocking(), renderBlocking(),
 *   stageInputs(), adoptLegacy().
 * Depends on: domain/stage-kinds, schemas/agent, schemas/pipeline, schemas/stage-run,
 *   schemas/ticket, types/stage-cursor. No IO.
 */

import { classifyStage } from '#/domain/stage-kinds.js';
import type { AgentRole, ArtifactKind } from '#/schemas/agent.js';
import type { Severity, Stage } from '#/schemas/pipeline.js';
import type { ReviewSubmission, StageOutcome } from '#/schemas/stage-run.js';
import type { Ticket } from '#/schemas/ticket.js';
import type {
  ResolvedPolicy,
  SnapshotView,
  StageSeed,
} from '#/types/stage-cursor.types.js';

export const DEFAULT_BLOCKING: readonly Severity[] = ['critical', 'high'];

/** The policy of `stage` with the defaults filled in; a stage without a policy gets the defaults. */
export function checkPolicy(stage: Stage): ResolvedPolicy {
  if (stage.kind === 'human' || stage.kind === 'merge') {
    return { on_blocking: 'rework', blocking: DEFAULT_BLOCKING };
  }

  return {
    on_blocking: stage.on_blocking ?? 'rework',
    blocking: stage.blocking ?? DEFAULT_BLOCKING,
  };
}

/** How many findings of `review` have a severity the policy blocks on. */
export function blockingCount(
  review: ReviewSubmission | undefined,
  policy: ResolvedPolicy,
): number {
  return review?.findings.filter((f) => policy.blocking.includes(f.severity)).length ?? 0;
}

/** True when the outcome stops the merge: a failed gate, or any finding the policy blocks on. */
export function isBlocking(outcome: StageOutcome, policy: ResolvedPolicy): boolean {
  return outcome.gate?.status === 'failed' || blockingCount(outcome.review, policy) > 0;
}

/** The blocking findings as text for the next writer's wake: one line each, place first. */
export function renderBlocking(
  label: string,
  review: ReviewSubmission,
  policy: ResolvedPolicy,
): string {
  const lines = review.findings
    .filter((f) => policy.blocking.includes(f.severity))
    .map((f) => {
      const at =
        f.file === undefined
          ? ''
          : `${f.file}${f.line === undefined ? '' : `:${f.line}`}: `;

      return `- [${f.severity}] ${at}${f.issue} (evidence: ${f.evidence})`;
    });

  return `${label} found ${lines.length} blocking finding(s). ${review.summary}\n${lines.join('\n')}`;
}

/**
 * The artifact kinds `declared` (an agent's inputs) that exist in `available`, in the agent's
 * order. `narrative` is dropped for every role that is not a writer or tester, listed or not.
 */
export function stageInputs(
  role: AgentRole | undefined,
  declared: readonly ArtifactKind[],
  available: readonly ArtifactKind[],
): ArtifactKind[] {
  const writes = role === 'writer' || role === 'tester';

  return declared.filter(
    (k, i) =>
      declared.indexOf(k) === i && available.includes(k) && (writes || k !== 'narrative'),
  );
}

/**
 * Stage rows to insert for a ticket already past its writers at deploy: each writer stage
 * adopted at cycle 0. A ticket that has not finished writing adopts nothing.
 */
export function adoptLegacy(
  ticket: Pick<Ticket, 'status'>,
  snapshot: SnapshotView,
): StageSeed[] {
  if (!['verifying', 'review', 'needs_signoff'].includes(ticket.status)) {
    return [];
  }

  return snapshot.definition.stages.flatMap((s) =>
    s.kind === 'agent' && classifyStage(s, snapshot.roles) === 'writer'
      ? [
          {
            stage_id: s.id,
            member_id: '',
            cycle: 0,
            kind: 'agent' as const,
            agent_id: s.agent,
            status: 'adopted' as const,
          },
        ]
      : [],
  );
}
