/**
 * Stand-in Director settings for a server that does not send them yet.
 *
 * Why: the Director page must open (showing "Using built-in defaults") even when it talks to
 *   a server that predates the planning flow, instead of failing the whole Settings area.
 *   The server owns the real built-ins and merges them at read time, so these values are only
 *   what the screen shows until the owner saves; a save writes just the changed keys and the
 *   server fills the rest. They mirror the shipped defaults of the default flow (survey, grill,
 *   verify, enhance for standard and full lanes, then the two locked steps; same ids,
 *   labels, limits and timeouts as core's built-ins) but carry no
 *   playbooks, because playbook text is the server's to ship.
 *
 * Exports: FALLBACK_STEP_MODELS, DEFAULT_FLOW, FALLBACK_RESEARCH, FALLBACK_DIRECTOR.
 * Depends on: schemas/director-config (types). No IO.
 */

import type { DirectorConfig, FlowStep, ResearchSettings } from '@forge/core';

/** Models for the planning steps an older server does not list. */
export const FALLBACK_STEP_MODELS = {
  card_survey: 'opus',
  grill_turn: 'sonnet',
  verify: 'sonnet',
  enhance: 'opus',
  write_plan: 'opus',
  approve_plan: 'sonnet',
  custom_step: 'sonnet',
  ticket_answer: 'sonnet',
  ticket_recover: 'opus',
  draft_agent: 'sonnet',
  ticket_check: 'opus',
  pick_substitute: 'sonnet',
  research: 'sonnet',
  memory_rewrite: 'haiku',
} as const;

export const DEFAULT_FLOW: readonly FlowStep[] = [
  {
    id: 'survey',
    kind: 'survey',
    label: 'Survey the code',
    enabled: true,
    when: 'always',
    depth: 'normal',
    locked: false,
  },
  {
    id: 'grill',
    kind: 'grill',
    label: 'Ask what is open',
    enabled: true,
    when: 'always',
    depth: 'normal',
    locked: false,
  },
  {
    id: 'verify',
    kind: 'verify',
    label: 'Verify against code and memory',
    enabled: true,
    when: 'always',
    depth: 'normal',
    locked: false,
  },
  {
    id: 'enhance',
    kind: 'enhance',
    label: 'Enhance the decisions',
    enabled: true,
    when: { lanes: ['standard', 'full'] },
    depth: 'normal',
    locked: false,
  },
  {
    id: 'write_plan',
    kind: 'write_plan',
    label: 'Write the plan',
    enabled: true,
    when: 'always',
    locked: true,
  },
  {
    id: 'approve',
    kind: 'approve',
    label: 'Approve the plan',
    enabled: true,
    when: 'always',
    locked: true,
  },
];

/** The company research settings an older server does not send: the built-in defaults (SearXNG on this machine). */
export const FALLBACK_RESEARCH: ResearchSettings = {
  provider: 'searxng',
  searxng: { base_url: 'http://localhost:8888', allow_hosts: [] },
  fetch: { allow_hosts: [], deny_hosts: [], timeout_ms: 10_000 },
};

export const FALLBACK_DIRECTOR: DirectorConfig = {
  flow: [...DEFAULT_FLOW],
  playbooks: {},
  house_rules: '',
  approval_mode: 'director_or_user',
  grill: { max_questions_per_round: 8, max_rounds: 3 },
  budget_warning_usd: 5,
  read_caps: { max_files: 40, max_bytes: 400_000 },
  research: {
    max_rounds: 2,
    max_searches: 6,
    max_fetches: 8,
    max_bytes: 600_000,
    max_runs_per_card: 4,
    grill_detours: true,
  },
  memory: {
    rewrite: true,
    rewrite_timeout_ms: 15_000,
    rewrite_budget_usd: 0.25,
    top_k: 8,
    pinned_max: 12,
    rejected_max: 25,
  },
  step_timeouts_ms: {
    triage: 120_000,
    dispatch_prompt: 120_000,
    steer_reply: 120_000,
    card_chat: 120_000,
    card_survey: 300_000,
    grill_turn: 120_000,
    verify: 300_000,
    enhance: 300_000,
    research: 180_000,
    write_plan: 420_000,
    approve_plan: 120_000,
    custom_step: 180_000,
    ticket_answer: 180_000,
    ticket_recover: 180_000,
    draft_agent: 120_000,
    ticket_check: 300_000,
    pick_substitute: 120_000,
    memory_rewrite: 30_000,
  },
  escalation: { director_first: true, answer_confidence: 0.8, max_director_retries: 1 },
  sign_off: { max_tier: 'B' },
  pipelines: {
    adjust: true,
    propose_after: 3,
    propose_min_cards: 2,
    propose_window_days: 30,
  },
  max_concurrent_steps: 3,
};
