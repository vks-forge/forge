/**
 * Stage cursor — what a ticket's pipeline asks for next, computed from its stage rows alone.
 *
 * Why: the engine must resume any ticket after any restart without a stored "current stage"
 *   that could drift from what really ran. The rows are the truth (one per stage, member and
 *   rework cycle, unique), so the cursor is a pure function over them: walk the stages in
 *   order, skip what is satisfied, and answer with the first thing that is not. A rework opens
 *   a new cycle that restarts at the stage the failure sends work back to; stages before it
 *   count as satisfied by their earlier passed records, so the test-writer is not re-run when
 *   the implementer is sent back. Anything the cursor cannot make sense of (an agent nobody
 *   knows, a failed row in the cycle it is asked about) answers `await`, never merge, so a
 *   corrupt row can stall a ticket visibly but can never let one through.
 *
 * Exports: currentCycle(), cycleStart(), reworkTarget(), stageCursor(), isCloser(), PROOF_MEMBER.
 * Depends on: domain/stage-kinds, schemas/pipeline, types/stage-cursor. No IO.
 */

import { classifyStage, lastWriterIndex } from '#/domain/stage-kinds.js';
import type { AgentStage, ScriptGateStage, Stage } from '#/schemas/pipeline.js';
import type { StageRunStatus } from '#/schemas/stage-run.js';
import type {
  CheckMember,
  CheckSlot,
  Cursor,
  SnapshotView,
  StageRecord,
} from '#/types/stage-cursor.types.js';

const DONE: readonly StageRunStatus[] = ['passed', 'adopted', 'skipped'];
const isDone = (r: StageRecord | undefined): boolean =>
  r !== undefined && DONE.includes(r.status);

/** The member id of the red-proof attempt that follows a tester's run. */
export const PROOF_MEMBER = 'proof';

/**
 * A row that ends its cycle: a failed attempt (work goes back), or a check that is held for
 * the owner (it is run again). A human stage waiting for the owner does not end anything.
 */
export const isCloser = (r: StageRecord): boolean =>
  r.status === 'failed' || (r.status === 'waiting' && r.kind !== 'human');

/** The cycle the ticket is in: the highest recorded, or the next one when that cycle ended. */
export function currentCycle(records: readonly StageRecord[]): number {
  let max = 0;
  for (const r of records) {
    max = Math.max(max, r.cycle);
  }

  return records.some((r) => r.cycle === max && isCloser(r)) ? max + 1 : max;
}

/**
 * The stage a failure of `stageId` sends work back to: the stage's own `rework_to` when it is
 * a writer above it, else the last writer above it, else the last writer. A writer restarts at
 * itself.
 */
export function reworkTarget(snapshot: SnapshotView, stageId: string): string {
  const { stages } = snapshot.definition;
  const at = stages.findIndex((s) => s.id === stageId);
  const stage = stages[at];
  const writer = (i: number): boolean =>
    stages[i] !== undefined &&
    classifyStage(stages[i] as Stage, snapshot.roles) === 'writer';

  if (stage && writer(at)) {
    return stage.id;
  }

  const last = lastWriterIndex(snapshot.definition, snapshot.roles);
  const fallback = (stages[last] ?? stages[0])?.id ?? stageId;
  if (!stage || stage.kind === 'human' || stage.kind === 'merge') {
    return fallback;
  }

  const named = stages.findIndex((s) => s.id === stage.rework_to);
  if (stage.rework_to !== undefined && named >= 0 && named < at && writer(named)) {
    return stage.rework_to;
  }

  for (let i = at - 1; i >= 0; i--) {
    if (writer(i)) {
      return (stages[i] as Stage).id;
    }
  }

  return fallback;
}

/** Index where cycle `cycle` starts: stages above it are satisfied by earlier passes. */
export function cycleStart(
  snapshot: SnapshotView,
  records: readonly StageRecord[],
  cycle: number,
): number {
  if (cycle === 0) {
    return 0;
  }

  const { stages } = snapshot.definition;
  const targets = records
    .filter((r) => r.cycle === cycle - 1 && isCloser(r))
    .map((r) =>
      stages.findIndex(
        (s) =>
          s.id ===
          (r.status === 'failed' ? reworkTarget(snapshot, r.stage_id) : r.stage_id),
      ),
    )
    .filter((i) => i >= 0);

  // No ended cycle behind this one: nothing is satisfied from before, so everything runs again.
  return targets.length === 0 ? 0 : Math.min(...targets);
}

/** What a set of check members needs: a start, a wait, or nothing (all done). */
function checkState(
  slots: readonly CheckSlot[],
):
  | { readonly kind: 'done' }
  | { readonly kind: 'wait' }
  | { readonly kind: 'start'; readonly members: CheckMember[] } {
  const start = slots.filter((s) => s.row === undefined || s.row.status === 'error');
  if (start.length > 0) {
    return { kind: 'start', members: start.map((s) => s.member) };
  }

  return slots.every((s) => isDone(s.row)) ? { kind: 'done' } : { kind: 'wait' };
}

/**
 * The next thing `snapshot`'s pipeline asks for at rework cycle `cycle` (use `currentCycle`).
 * Writers and the red proof are asked for while the ticket is in progress; the gates, checks,
 * the merge decision while it is verifying.
 */
export function stageCursor(
  snapshot: SnapshotView,
  records: readonly StageRecord[],
  cycle: number,
): Cursor {
  const { stages } = snapshot.definition;
  const start = cycleStart(snapshot, records, cycle);
  const row = (stageId: string, member: string, at = cycle): StageRecord | undefined =>
    records.find(
      (r) => r.stage_id === stageId && r.member_id === member && r.cycle === at,
    );

  const earlier = (stageId: string, member: string): boolean =>
    records.some(
      (r) =>
        r.stage_id === stageId && r.member_id === member && r.cycle <= cycle && isDone(r),
    );

  const hasOpenHuman = stages.some((s) => s.kind === 'human' && !isDone(row(s.id, '')));

  for (const [i, stage] of stages.entries()) {
    const above = i < start;
    const klass = classifyStage(stage, snapshot.roles);
    if (klass === 'unknown') {
      return { kind: 'await', stage, cycle };
    }

    if (klass === 'writer') {
      const w = stage as AgentStage;
      if (!(above ? earlier(w.id, '') : isDone(row(w.id, '')))) {
        return { kind: 'run_writer', stage: w, cycle };
      }

      // An adopted writer never ran here, so there are no new tests to prove red.
      if (above || w.proof !== 'red' || row(w.id, '')?.status === 'adopted') {
        continue;
      }

      // The advisory red proof: absent or errored means run it, running means wait.
      const proof = row(w.id, PROOF_MEMBER);
      if (proof === undefined || proof.status === 'error') {
        return { kind: 'run_proof', stage: w, cycle };
      }

      if (!isDone(proof)) {
        return { kind: 'await', stage, cycle };
      }

      continue;
    }

    if (klass === 'human') {
      if (isDone(row(stage.id, ''))) {
        continue;
      }

      return { kind: 'merge', hold: true, cycle };
    }

    if (klass === 'merge') {
      return isDone(row(stage.id, ''))
        ? { kind: 'done' }
        : { kind: 'merge', hold: hasOpenHuman, cycle };
    }

    const members: CheckMember[] =
      stage.kind === 'group'
        ? stage.members.map((m) => ({ id: m.id, stage: m }))
        : [{ id: '', stage: stage as AgentStage | ScriptGateStage }];

    const slots: CheckSlot[] = members.map((m) => ({
      member: m,
      row: above
        ? records.find(
            (r) =>
              r.stage_id === stage.id &&
              r.member_id === m.id &&
              r.cycle <= cycle &&
              isDone(r),
          )
        : row(stage.id, m.id),
    }));

    const state = checkState(slots);
    if (state.kind === 'done') {
      continue;
    }

    if (state.kind === 'wait') {
      return { kind: 'await', stage, cycle };
    }

    if (klass === 'g1') {
      return { kind: 'start_gates', stage: stage as ScriptGateStage, cycle };
    }

    return { kind: 'run_checks', stage, members: state.members, cycle };
  }

  return { kind: 'await', stage: stages[stages.length - 1] as Stage, cycle };
}
