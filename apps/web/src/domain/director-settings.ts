/**
 * What the Director page says: step names, model choices, locked rules and number fields.
 *
 * Why: the Director page edits seventeen per-step models, a handful of limits and a flow, and
 *   shows the rules no setting can switch off. Each needs words an owner understands (what the
 *   step is for, what a limit does when it is reached, why a rule is locked), kept as data so
 *   a new Director step is a line here and the screens stay thin. The locked list is the set
 *   of d-0150; each reason says what would go wrong if the rule could be edited. The budget
 *   field says outright that it only warns, because the owner would otherwise assume a cap.
 *
 * Exports: STEP_INFO, MODEL_CHOICES, LOCKED_RULES, APPROVAL_ITEMS, SIGN_OFF_ITEMS, SIGN_OFF_ORDER, DIRECTOR_FIELD_GROUPS,
 *   DIRECTOR_FIELDS, effectiveDirector(), overriddenKeys(), describeFlow().
 * Depends on: @forge/core (types), domain/director-research-fields, types/director-ui.types, types/settings-fields.types,
 *   types/picker.types. Pure data.
 */

import type { DirectorConfig, FlowStep, StepName } from '@forge/core';
import type { PickerItem } from '#/types/picker.types.js';
import type { LockedRule, OverridableKey, StepInfo } from '#/types/director-ui.types.js';
import { RESEARCH_LIMIT_FIELDS } from '#/domain/director-research-fields.js';
import type { FieldSpec } from '#/types/settings-fields.types.js';

export const STEP_INFO: Readonly<Record<StepName, StepInfo>> = {
  triage: { label: 'Triage', hint: 'Sorts a new request into a lane.' },
  dispatch_prompt: {
    label: 'Worker prompt',
    hint: 'Writes the brief a Worker starts from.',
  },
  steer_reply: { label: 'Reply', hint: 'Answers when you steer a running ticket.' },
  card_chat: { label: 'Card chat', hint: 'Talks with you on a card.' },
  card_survey: {
    label: 'Survey',
    hint: 'Reads the repository before the first question.',
  },
  grill_turn: { label: 'Grill turn', hint: 'Asks the next question, with choices.' },
  verify: { label: 'Verify', hint: 'Checks the plan against the code.' },
  enhance: { label: 'Enhance', hint: 'Tightens the decisions you made.' },
  write_plan: { label: 'Write plan', hint: 'Turns the decisions into tickets.' },
  approve_plan: {
    label: 'Approve plan',
    hint: 'Decides whether a plan may start without you.',
  },
  custom_step: { label: 'Custom step', hint: 'Runs the steps you add to the flow.' },
  ticket_answer: {
    label: 'Answer a Worker',
    hint: 'Looks at a Worker’s question first and answers it when it is sure.',
  },
  ticket_recover: {
    label: 'Recover a failure',
    hint: 'Diagnoses a stopped ticket and retries it once before asking you.',
  },
  draft_agent: {
    label: 'Draft an agent',
    hint: 'Proposes an agent definition from your description; nothing is saved from it.',
  },
  ticket_check: {
    label: 'Check against the plan',
    hint: 'Compares finished work with the plan before sign-off; it never sees the Worker’s own account.',
  },
  research: {
    label: 'Research',
    hint: 'Looks up outside facts on the web and keeps the quotes it can verify; nothing it reads is ever treated as an instruction.',
  },
  pick_substitute: {
    label: 'Pick a substitute agent',
    hint: 'When an agent and all its fallbacks cannot run, chooses another agent for the same role from a list Forge has already checked.',
  },
};

/** The sign-off ceilings, lowest to highest; tier C is not among them because it is always yours. */
export const SIGN_OFF_ITEMS: readonly PickerItem[] = [
  {
    value: 'B',
    label: 'Up to tier B',
    description:
      'The Director signs low and moderate risk changes when every check passed.',
  },
  {
    value: 'A',
    label: 'Tier A only',
    description: 'The Director signs only the lowest-risk changes; tier B comes to you.',
  },
  {
    value: 'none',
    label: 'Never',
    description: 'Every change waits for your signature.',
  },
];

export const SIGN_OFF_ORDER = ['none', 'A', 'B'] as const;

/** Common models offered first; anything else is typed in. */
export const MODEL_CHOICES: readonly PickerItem[] = [
  { value: 'opus', label: 'Opus', description: 'Strongest; best for planning.' },
  { value: 'sonnet', label: 'Sonnet', description: 'Faster and cheaper.' },
  { value: 'haiku', label: 'Haiku', description: 'Quickest; for simple steps.' },
  { value: 'custom', label: 'Other…', description: 'Type a model name.' },
];

export const LOCKED_RULES: readonly LockedRule[] = [
  {
    id: 'approval-floor',
    title: 'The approval floor',
    reason:
      'A plan may only start by itself when fixed checks pass (no protected path, no overlap with other cards). If a setting could relax it, a bad plan could approve itself.',
  },
  {
    id: 'tier-c',
    title: 'Tier C needs you',
    reason:
      'Changes to Forge’s own policy files always wait for a person. Letting the Director sign them off would let it widen its own powers.',
  },
  {
    id: 'tool-less-approval',
    title: 'The approval step has no tools',
    reason:
      'It sees only the plan and the check results, never the repository text, so nothing read from the repo can talk it into approving.',
  },
  {
    id: 'independent-check',
    title: 'A writer is always followed by an independent check',
    reason:
      'Whoever wrote the work never marks it done. Removing the check would let a mistake pass unseen.',
  },
  {
    id: 'one-door',
    title: 'One merge door, one door per state change',
    reason:
      'Every merge and every ticket or card status change goes through a single checked path, so no shortcut can skip a rule.',
  },
  {
    id: 'data-not-orders',
    title: 'Web and repository text is data',
    reason:
      'Text the Director reads is never treated as an instruction, so a hostile page or file cannot steer it.',
  },
];

export const APPROVAL_ITEMS: readonly PickerItem[] = [
  {
    value: 'director_or_user',
    label: 'Director approves when the floor passes',
    description: 'You are asked only when a check fails or the Director is unsure.',
  },
  {
    value: 'always_ask',
    label: 'Always ask me',
    description: 'Every plan waits for your approval.',
  },
];

const DIRECTOR_FIELD_LIST: Readonly<
  Record<
    Exclude<OverridableKey, 'flow' | 'house_rules' | 'approval_mode' | 'sign_off'>,
    readonly FieldSpec[]
  >
> = {
  grill: [
    {
      kind: 'number',
      path: 'director.grill.max_questions_per_round',
      label: 'Questions per round',
      hint: 'Past this, the rest become stated assumptions.',
    },
    {
      kind: 'number',
      path: 'director.grill.max_rounds',
      label: 'Rounds',
      hint: 'The first round plus each time you request changes.',
    },
  ],
  budget_warning_usd: [
    {
      kind: 'number',
      path: 'director.budget_warning_usd',
      label: 'Warn when a card has spent',
      unit: 'USD',
      step: 0.5,
      hint: 'A warning only. Nothing is stopped or refused at this level.',
    },
  ],
  read_caps: [
    {
      kind: 'number',
      path: 'director.read_caps.max_files',
      label: 'Files one step may read',
    },
    {
      kind: 'number',
      path: 'director.read_caps.max_bytes',
      label: 'Bytes one step may read',
      unit: 'KB',
      scale: 1000,
      hint: 'Reads stop at this total; the step works with what it has.',
    },
  ],
  research: RESEARCH_LIMIT_FIELDS,
  escalation: [
    {
      kind: 'switch',
      path: 'director.escalation.director_first',
      label: 'The Director looks first',
      hint: 'When off, every waiting ticket goes straight to you.',
    },
    {
      kind: 'number',
      path: 'director.escalation.answer_confidence',
      label: 'Answer a Worker alone at confidence',
      step: 0.05,
      hint: 'From 0 to 1. Below it the Director asks you instead. Tier C tickets, tools and logins are always yours.',
    },
    {
      kind: 'number',
      path: 'director.escalation.max_director_retries',
      label: 'Retries before asking you',
      hint: 'How many times the Director retries one failure of one ticket by itself.',
    },
  ],
  pipelines: [
    {
      kind: 'switch',
      path: 'director.pipelines.adjust',
      label: 'Let the Director adjust ticket pipelines',
      hint: 'When off, every ticket runs its lane exactly as you set it. Locked stages (merge, gates, sign-off) are never changed either way.',
    },
    {
      kind: 'number',
      path: 'director.pipelines.propose_after',
      label: 'Suggest a project pipeline change after this many tickets',
      hint: 'From 2 to 10. The same change must have been made on this many tickets.',
    },
    {
      kind: 'number',
      path: 'director.pipelines.propose_min_cards',
      label: 'from at least this many cards',
      hint: 'From 1 to 5. One big card repeating a change does not count as a pattern.',
    },
    {
      kind: 'number',
      path: 'director.pipelines.propose_window_days',
      label: 'within this many days',
      unit: 'days',
      hint: 'From 7 to 90. Nothing is changed until you accept the suggestion.',
    },
  ],
  step_timeouts_ms: (Object.keys(STEP_INFO) as StepName[]).map((name): FieldSpec => ({
    kind: 'number',
    path: `director.step_timeouts_ms.${name}`,
    label: `${STEP_INFO[name].label} may run up to`,
    unit: 's',
    scale: 1000,
  })),
};

export const DIRECTOR_FIELDS = DIRECTOR_FIELD_LIST;

/** Every numeric Director field, for the shared validation error wording. */
export const DIRECTOR_FIELD_GROUPS: readonly FieldSpec[] =
  Object.values(DIRECTOR_FIELD_LIST).flat();

/** The company Director settings with a project's partial override laid on top (arrays and playbooks replace). */
export function effectiveDirector(
  company: DirectorConfig,
  override: Partial<DirectorConfig> | undefined,
): DirectorConfig {
  const out: Record<string, unknown> = { ...company };
  for (const [key, value] of Object.entries(override ?? {})) {
    const base = out[key];
    out[key] =
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof base === 'object' &&
      base !== null
        ? { ...base, ...value }
        : value;
  }

  return out as unknown as DirectorConfig;
}

/** The sections a project override changes. */
export function overriddenKeys(override: Partial<DirectorConfig> | undefined): string[] {
  return Object.keys(override ?? {});
}

/** The flow as a sentence for the inherited view: `Survey, Grill, ... (2 off)`. */
export function describeFlow(flow: readonly FlowStep[]): string {
  const on = flow.filter((s) => s.enabled).map((s) => s.label);
  const off = flow.length - on.length;

  return `${on.join(' → ')}${off > 0 ? ` (${off} switched off)` : ''}`;
}
