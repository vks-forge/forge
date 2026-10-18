/**
 * Director planning flow schemas — the ordered step list a card is planned with.
 *
 * Why: before any ticket exists the Director grills the owner, checks the work against the
 *   code, enhances the decisions and writes a plan (d-0017, d-0146). Teams differ in how
 *   much of that they want, so the order, the on/off switches, the "when" conditions and the
 *   extra custom steps are data the owner edits, not code. The two steps that carry the
 *   safety rules, writing the plan and approving it, are locked: they must exist exactly
 *   once, stay enabled, and sit last in that order, so no edit can produce a flow that skips
 *   the approval floor or approves before a plan is written. The runner trusts these
 *   refinements and nothing else about the list, so they are checked when a config is
 *   saved and again when a card snapshots its flow.
 *
 * Exports: FLOW_STEP_KINDS, FlowStepKind, FlowDepth, FlowWhen, FlowStep, DirectorFlow.
 * Depends on: schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { Lane } from '#/schemas/ticket.js';

export const FLOW_STEP_KINDS = [
  'survey',
  'grill',
  'verify',
  'enhance',
  'research',
  'write_plan',
  'approve',
  'custom',
] as const;
export const FlowStepKind = z.enum(FLOW_STEP_KINDS);
export type FlowStepKind = z.infer<typeof FlowStepKind>;

/** How hard a step works: light skims, deep reads widely. Steps that ignore depth leave it unset. */
export const FlowDepth = z.enum(['light', 'normal', 'deep']);
export type FlowDepth = z.infer<typeof FlowDepth>;

/** When a step runs: always, only for the listed lanes, or when the Director decides. */
export const FlowWhen = z.union([
  z.literal('always'),
  z.strictObject({ lanes: z.array(Lane).min(1) }),
  z.literal('director_decides'),
]);
export type FlowWhen = z.infer<typeof FlowWhen>;

export const FlowStep = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  kind: FlowStepKind,
  label: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  when: FlowWhen,
  depth: FlowDepth.optional(),
  /** The playbook (a key of `director.playbooks`) whose text is the method of this step. */
  playbook_id: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .optional(),
  /** Extra instructions appended after the playbook; required for a custom step. */
  instructions: z.string().optional(),
  /** Locked steps cannot be removed, disabled or moved; they carry the safety rules (d-0146). */
  locked: z.boolean(),
});
export type FlowStep = z.infer<typeof FlowStep>;

/** The flow's invariants as one message per breach; empty when the list is valid. */
function flowProblems(flow: readonly FlowStep[]): string[] {
  const problems: string[] = [];
  const ids = flow.map((s) => s.id);
  if (new Set(ids).size !== ids.length) {
    problems.push('step ids must be unique');
  }

  for (const kind of ['write_plan', 'approve'] as const) {
    const of = flow.filter((s) => s.kind === kind);
    if (of.length !== 1) {
      problems.push(`the flow needs exactly one ${kind} step`);
    }

    for (const s of of) {
      if (!s.locked) {
        problems.push(`the ${kind} step must be locked`);
      }

      if (!s.enabled) {
        problems.push(`the ${kind} step must be enabled`);
      }
    }
  }

  const last = flow[flow.length - 1];
  const beforeLast = flow[flow.length - 2];
  if (last?.kind !== 'approve') {
    problems.push('the approve step must be last');
  }

  if (beforeLast?.kind !== 'write_plan') {
    problems.push('the write_plan step must come right before approve');
  }

  if (flow.filter((s) => s.kind === 'research').length > 1) {
    problems.push('the flow may have at most one research step');
  }

  for (const s of flow) {
    if (s.kind === 'custom' && (s.instructions ?? '').trim() === '') {
      problems.push(`custom step ${s.id} needs instructions`);
    }

    if (s.locked && s.kind !== 'write_plan' && s.kind !== 'approve') {
      problems.push(`only write_plan and approve may be locked (${s.id})`);
    }
  }

  return problems;
}

/** The ordered step list with the locked-step invariants of d-0146 enforced. */
export const DirectorFlow = z.array(FlowStep).superRefine((flow, ctx) => {
  for (const message of flowProblems(flow)) {
    ctx.addIssue({ code: 'custom', message });
  }
});
export type DirectorFlow = z.infer<typeof DirectorFlow>;
