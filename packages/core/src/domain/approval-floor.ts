/**
 * Approval floor — the deterministic checks a plan must pass before the Director may approve it.
 *
 * Why: the Director can approve a plan itself (d-0133), but a model's judgement alone must
 *   never be what lets a risky plan through: the plan was written from repository text that
 *   may be hostile or simply wrong. The floor is plain code over typed facts. It refuses when
 *   a planned file is a Tier C path (a human signs those, d-0012), when verification matched a
 *   rejected approach, when another card with an approved, unfinished plan plans to touch the
 *   same file, when git shows a file under the plan changed since the plan was verified, or when a ticket's
 *   planned pipeline removes a stage of its lane's list (a lighter pipeline needs a person's say-so).
 *   It can only make approval stricter: a pass means "the Director may decide", never "approve".
 *   Budget is not a condition (d-0143).
 *
 * Exports: checkFloor(), plannedFiles().
 * Depends on: shared/glob, schemas/plan, types/approval-floor. No IO.
 */

import type { FloorResult, PlanVersion } from '#/schemas/plan.js';
import { globMatch } from '#/shared/glob.js';
import type { ApprovalFloorInput } from '#/types/approval-floor.types.js';

const norm = (path: string): string => path.replaceAll('\\', '/').replace(/^\.\//, '');

/** Every file the plan's tickets name, normalised and unique, in first-seen order. */
export function plannedFiles(plan: Pick<PlanVersion, 'tickets'>): string[] {
  return [...new Set(plan.tickets.flatMap((t) => t.files.map(norm)))];
}

/** The floor's verdict with one reason per breach; `pass` is true only when there is none. */
export function checkFloor(input: ApprovalFloorInput): FloorResult {
  const reasons: string[] = [];
  const files = plannedFiles(input.plan);

  const tierC = files.filter((f) => input.tierCGlobs.some((g) => globMatch(g, f, true)));
  if (tierC.length > 0) {
    reasons.push(`plans a Tier C path, which a human must approve: ${tierC.join(', ')}`);
  }

  const rejected = input.plan.verification.rejected_hits;
  if (rejected.length > 0) {
    reasons.push(`matches an approach that was rejected before: ${rejected.join('; ')}`);
  }

  const mine = new Set(files);
  for (const other of input.otherPlannedFiles) {
    const shared = [...new Set(other.files.map(norm))].filter((f) => mine.has(f));
    if (shared.length > 0) {
      reasons.push(`overlaps card ${other.cardId} on ${shared.join(', ')}`);
    }
  }

  const moved = [...new Set(input.changedSinceBase.map(norm))];
  if (moved.length > 0) {
    reasons.push(`changed since the plan was verified: ${moved.join(', ')}`);
  }

  for (const l of input.lighter ?? []) {
    reasons.push(
      `${l.key} runs a lighter pipeline than its lane (removes ${l.removed.join(', ')})`,
    );
  }

  return { pass: reasons.length === 0, reasons };
}
