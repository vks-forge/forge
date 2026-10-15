/**
 * The company settings the Limits and General screens edit, as field descriptors.
 *
 * Why: the owner tunes how many Workers run, how long Forge waits and how much a run may
 *   spend without a code edit (d-0085, d-0090). Each dial gets a plain-language label, a hint
 *   that says what happens when it is raised or lowered, and a unit the person thinks in
 *   (seconds, minutes, dollars) while the stored value stays in the schema's unit (ms). The
 *   list-shaped caps (per harness, per state) and the data folder have their own components.
 *
 * Exports: LIMIT_GROUPS, GENERAL_GROUPS.
 * Depends on: types/settings-fields.types. Pure data.
 */

import type { FieldGroup } from '#/types/settings-fields.types.js';

export const LIMIT_GROUPS: readonly FieldGroup[] = [
  {
    id: 'concurrency',
    title: 'Workers at once',
    description:
      'Caps on how many Workers run at the same time. The lowest cap that applies wins.',
    fields: [
      {
        kind: 'number',
        path: 'engine.max_concurrent_global',
        label: 'On this machine',
        hint: 'All projects and harnesses together.',
      },
      {
        kind: 'number',
        path: 'engine.max_concurrent_per_project',
        label: 'Per project',
        hint: 'A project can lower its own cap in its project settings.',
      },
      {
        kind: 'number',
        path: 'engine.max_concurrent_per_harness.default',
        label: 'Per harness, unless listed below',
      },
    ],
  },
  {
    id: 'quota',
    title: 'Quota',
    description:
      'What Forge does when a harness runs out of quota: how long it waits and where work goes meanwhile.',
    fields: [
      {
        kind: 'number',
        path: 'engine.quota_default_pause_ms',
        label: 'Wait when no reset time is given',
        unit: 'min',
        scale: 60_000,
        hint: 'Used when the harness does not say when its quota returns.',
      },
    ],
  },
  {
    id: 'spend',
    title: 'Spend caps',
    description: 'Hard limits that stop a run or a Director step that costs too much.',
    fields: [
      {
        kind: 'number',
        path: 'engine.run_budget.max_usd',
        label: 'Per Worker run',
        unit: 'USD',
        step: 0.5,
      },
      { kind: 'number', path: 'engine.run_budget.max_turns', label: 'Turns per run' },
      {
        kind: 'number',
        path: 'engine.step_budget_usd',
        label: 'Per Director step',
        unit: 'USD',
        step: 0.1,
      },
    ],
  },
];

export const GENERAL_GROUPS: readonly FieldGroup[] = [
  {
    id: 'timing',
    title: 'Timing',
    description: 'How often Forge looks for work and how long it waits before acting.',
    fields: [
      {
        kind: 'number',
        path: 'engine.tick_interval_ms',
        label: 'Look for work every',
        unit: 's',
        scale: 1000,
        hint: 'At least 10 seconds.',
      },
      {
        kind: 'number',
        path: 'engine.stall_ms',
        label: 'Treat a silent run as stalled after',
        unit: 's',
        scale: 1000,
      },
      {
        kind: 'number',
        path: 'engine.run_budget.turn_ms',
        label: 'Longest single turn',
        unit: 's',
        scale: 1000,
      },
      {
        kind: 'number',
        path: 'engine.interaction_timeout_ms',
        label: 'Wait for your answer up to',
        unit: 'min',
        scale: 60_000,
      },
      {
        kind: 'number',
        path: 'engine.shutdown_drain_ms',
        label: 'On stop, let running tools finish for',
        unit: 's',
        scale: 1000,
        hint: '0 interrupts runs at once.',
      },
    ],
  },
  {
    id: 'director',
    title: 'Director',
    description: 'How sure the Director must be, and how it retries and wakes.',
    fields: [
      {
        kind: 'number',
        path: 'engine.confidence_threshold',
        label: 'Act alone above confidence',
        step: 0.05,
        hint: 'Between 0 and 1. Below it the Director asks you.',
      },
      { kind: 'number', path: 'engine.step_retries', label: 'Retries per Director step' },
      { kind: 'number', path: 'engine.rewake_cap.max', label: 'Wake a run at most' },
      {
        kind: 'number',
        path: 'engine.rewake_cap.window_ms',
        label: '... times within',
        unit: 'min',
        scale: 60_000,
      },
    ],
  },
  {
    id: 'models',
    title: 'Models',
    description: 'Which model answers each Director step and each kind of Worker.',
    fields: [
      { kind: 'text', path: 'models.director.triage', label: 'Director: triage' },
      {
        kind: 'text',
        path: 'models.director.dispatch_prompt',
        label: 'Director: write the Worker prompt',
      },
      { kind: 'text', path: 'models.director.steer_reply', label: 'Director: reply' },
      { kind: 'text', path: 'models.worker.express', label: 'Worker: express lane' },
      { kind: 'text', path: 'models.worker.standard', label: 'Worker: standard lane' },
      { kind: 'text', path: 'models.worker.full', label: 'Worker: full lane' },
    ],
  },
  {
    id: 'retries',
    title: 'Retries',
    description: 'How long Forge waits before trying a failed run again, by cause.',
    fields: [
      {
        kind: 'number',
        path: 'engine.retry.rate_limit.base_ms',
        label: 'Rate limit: first wait',
        unit: 's',
        scale: 1000,
      },
      {
        kind: 'number',
        path: 'engine.retry.rate_limit.max_ms',
        label: 'Rate limit: longest wait',
        unit: 's',
        scale: 1000,
      },
      {
        kind: 'number',
        path: 'engine.retry.rate_limit.max_attempts',
        label: 'Rate limit: attempts',
      },
      {
        kind: 'number',
        path: 'engine.retry.crash.delay_ms',
        label: 'Crash: wait',
        unit: 's',
        scale: 1000,
      },
      {
        kind: 'number',
        path: 'engine.retry.crash.max_attempts',
        label: 'Crash: attempts',
      },
      {
        kind: 'number',
        path: 'engine.retry.stall.delay_ms',
        label: 'Stall: wait',
        unit: 's',
        scale: 1000,
      },
      {
        kind: 'number',
        path: 'engine.retry.stall.max_attempts',
        label: 'Stall: attempts',
      },
      {
        kind: 'number',
        path: 'engine.retry.unknown.delay_ms',
        label: 'Unknown cause: wait',
        unit: 's',
        scale: 1000,
      },
      {
        kind: 'number',
        path: 'engine.retry.unknown.max_attempts',
        label: 'Unknown cause: attempts',
      },
    ],
  },
];
