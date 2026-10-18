/**
 * Flow editing rules: move, switch, add and remove steps, and check the list before saving.
 *
 * Why: the planning flow is edited by hand, and the two steps that carry the safety rules
 *   (write the plan, approve it) must stay exactly where they are: once, enabled, last
 *   (d-0146). The server refuses a flow that breaks that, but a person should learn it before
 *   a round trip, in words tied to the step at fault, and the editor should never offer a move
 *   that could produce such a flow. These pure functions are that logic: what a step may do
 *   and why not, the next list for each edit, and one `flowIssues()` that mirrors core's
 *   refinements (the server stays the authority and re-checks).
 *
 * Exports: LOCKED_REASON, MAX_LABEL, whenKind(), stepAction(), moveStep(), patchStep(),
 *   removeStep(), addCustomStep(), addResearchStep(), hasResearchStep(), RESEARCH_PRESENT_REASON, flowIssues(), customStepId().
 * Depends on: @forge/core (types), types/director-ui.types. No IO.
 */

import type { FlowStep, Lane } from '@forge/core';
import type { FlowIssue, StepAction, WhenKind } from '#/types/director-ui.types.js';

export const LOCKED_REASON =
  'Locked: this step carries the approval rules, so it cannot be moved, switched off or removed.';

export const MAX_LABEL = 80;

const ID_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/;

export function whenKind(step: FlowStep): WhenKind {
  return typeof step.when === 'object' ? 'lanes' : step.when;
}

/** Index of the first step that may not be passed: the write_plan step, which stays right before approve. */
function tailStart(flow: readonly FlowStep[]): number {
  const at = flow.findIndex((s) => s.locked);

  return at === -1 ? flow.length : at;
}

/** Whether the step at `id` may move one place up (`-1`) or down (`1`), and why not. */
export function stepAction(
  flow: readonly FlowStep[],
  id: string,
  direction: -1 | 1,
): StepAction {
  const at = flow.findIndex((s) => s.id === id);
  const step = flow[at];

  if (!step) {
    return { ok: false, reason: 'No such step.' };
  }

  if (step.locked) {
    return { ok: false, reason: LOCKED_REASON };
  }

  if (direction === -1 && at === 0) {
    return { ok: false, reason: 'Already first.' };
  }

  if (direction === 1 && at + 1 >= tailStart(flow)) {
    return { ok: false, reason: 'Steps stay before the locked write and approve steps.' };
  }

  return { ok: true };
}

/** The list with `id` moved one place; unchanged when the move is not allowed. */
export function moveStep(
  flow: readonly FlowStep[],
  id: string,
  direction: -1 | 1,
): FlowStep[] {
  if (!stepAction(flow, id, direction).ok) {
    return [...flow];
  }

  const next = [...flow];
  const at = next.findIndex((s) => s.id === id);
  const to = at + direction;
  const moved = next[at];
  const swapped = next[to];

  if (moved && swapped) {
    next[at] = swapped;
    next[to] = moved;
  }

  return next;
}

/**
 * The list with one step changed. A locked step keeps its switch, order and condition: only
 * its instructions (and a custom label) may change, so an edit cannot unlock the rules.
 */
export function patchStep(
  flow: readonly FlowStep[],
  id: string,
  change: Partial<Omit<FlowStep, 'id' | 'kind' | 'locked'>>,
): FlowStep[] {
  return flow.map((step) => {
    if (step.id !== id) {
      return step;
    }

    if (step.locked) {
      const { instructions } = change;

      return instructions === undefined ? step : { ...step, instructions };
    }

    return { ...step, ...change };
  });
}

/** The list without the step; a locked step stays. */
export function removeStep(flow: readonly FlowStep[], id: string): FlowStep[] {
  return flow.filter((s) => s.id !== id || s.locked);
}

/** A unique id from the name: lower-case, dashes, a `custom-` prefix when it would not start with a letter. */
export function customStepId(flow: readonly FlowStep[], name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

  const base = /^[a-z]/.test(slug) ? slug : `custom-${slug}`.replace(/-+$/, '');
  const taken = new Set(flow.map((s) => s.id));
  let id = base === '' || base === 'custom' ? 'custom-step' : base;
  for (let n = 2; taken.has(id); n += 1) {
    id = `${base || 'custom-step'}-${n}`;
  }

  return id;
}

/** A custom step inserted just before the locked tail (write the plan, approve). */
export function addCustomStep(
  flow: readonly FlowStep[],
  input: { name: string; instructions: string },
): FlowStep[] {
  const step: FlowStep = {
    id: customStepId(flow, input.name),
    kind: 'custom',
    label: input.name.trim(),
    enabled: true,
    when: 'always',
    instructions: input.instructions.trim(),
    locked: false,
  };

  const next = [...flow];
  next.splice(tailStart(flow), 0, step);

  return next;
}

export const RESEARCH_PRESENT_REASON =
  'The flow already has a Research step. A flow may have only one.';

/** True when the flow already holds its one Research step (core allows at most one). */
export function hasResearchStep(flow: readonly FlowStep[]): boolean {
  return flow.some((s) => s.kind === 'research');
}

/**
 * The Research step as Forge ships it, inserted just before the locked tail; the list is
 * returned unchanged when it already has one.
 */
export function addResearchStep(flow: readonly FlowStep[]): FlowStep[] {
  if (hasResearchStep(flow)) {
    return [...flow];
  }

  const taken = new Set(flow.map((s) => s.id));
  const next = [...flow];
  next.splice(tailStart(flow), 0, {
    id: taken.has('research') ? customStepId(flow, 'research step') : 'research',
    kind: 'research',
    label: 'Research outside facts',
    enabled: true,
    when: 'director_decides',
    depth: 'normal',
    locked: false,
  });

  return next;
}

const LANES: readonly Lane[] = ['express', 'standard', 'full'];

/** Everything wrong with the list, one message each; `stepId` is set when one step is at fault. */
export function flowIssues(
  flow: readonly FlowStep[],
  playbooks?: Readonly<Record<string, unknown>>,
): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const ids = flow.map((s) => s.id);

  if (new Set(ids).size !== ids.length) {
    issues.push({ message: 'Step ids must be unique.' });
  }

  for (const kind of ['write_plan', 'approve'] as const) {
    const of = flow.filter((s) => s.kind === kind);

    if (of.length !== 1) {
      issues.push({ message: `The flow needs exactly one ${kind} step.` });
    }

    for (const s of of) {
      if (!s.locked || !s.enabled) {
        issues.push({
          stepId: s.id,
          message: `The ${kind} step must stay locked and switched on.`,
        });
      }
    }
  }

  if (flow.filter((s) => s.kind === 'research').length > 1) {
    issues.push({ message: 'The flow may have only one Research step.' });
  }

  if (flow.at(-1)?.kind !== 'approve') {
    issues.push({ message: 'The approve step must be last.' });
  }

  if (flow.at(-2)?.kind !== 'write_plan') {
    issues.push({ message: 'The write_plan step must come right before approve.' });
  }

  for (const s of flow) {
    if (!ID_PATTERN.test(s.id)) {
      issues.push({ stepId: s.id, message: 'The step id is not valid.' });
    }

    if (s.label.trim() === '' || s.label.length > MAX_LABEL) {
      issues.push({
        stepId: s.id,
        message: `Give the step a name of 1 to ${MAX_LABEL} characters.`,
      });
    }

    if (s.kind === 'custom' && (s.instructions ?? '').trim() === '') {
      issues.push({ stepId: s.id, message: 'A custom step needs instructions.' });
    }

    if (typeof s.when === 'object' && !s.when.lanes.some((l) => LANES.includes(l))) {
      issues.push({ stepId: s.id, message: 'Pick at least one lane.' });
    }

    if (s.playbook_id !== undefined && playbooks && !(s.playbook_id in playbooks)) {
      issues.push({
        stepId: s.id,
        message: `The playbook ${s.playbook_id} does not exist.`,
      });
    }
  }

  return issues;
}
