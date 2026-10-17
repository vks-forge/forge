/**
 * Built-in Director settings — the planning flow, playbooks and limits a fresh install runs on.
 *
 * Why: like every other setting, the Director's defaults are code the release ships and
 *   overrides stored in the database layer over them (d-0085, d-0090, d-0150), so a fresh
 *   install reads the flow and playbooks at config version 0 and a later release can improve a
 *   playbook for everyone who never edited it. The default flow is survey, grill, verify,
 *   enhance (Standard and Full lanes only), then the two locked steps: write the plan and
 *   approve it (d-0146). Each step names the playbook that carries its method; the eight
 *   playbooks (six for planning, two for the escalation steps) are real, usable method text,
 *   kept one per file under `playbooks/`. The escalation dials default to "Director first".
 *
 * Exports: BUILTIN_DIRECTOR_CONFIG, DIRECTOR_STEP_TIMEOUTS_MS.
 * Depends on: domain/playbooks/*, schemas/director-config. No IO.
 */

import { ANSWER_WORKER_PLAYBOOK } from '#/domain/playbooks/answer-worker.js';
import { APPROVE_PLAN_PLAYBOOK } from '#/domain/playbooks/approve-plan.js';
import { ENHANCE_DECISIONS_PLAYBOOK } from '#/domain/playbooks/enhance-decisions.js';
import { PLAN_GRILL_PLAYBOOK } from '#/domain/playbooks/plan-grill.js';
import { PLAN_TO_TICKETS_PLAYBOOK } from '#/domain/playbooks/plan-to-tickets.js';
import { RECOVER_FAILURE_PLAYBOOK } from '#/domain/playbooks/recover-failure.js';
import { VERIFY_PLAN_PLAYBOOK } from '#/domain/playbooks/verify-plan.js';
import { WRITE_PLAN_PLAYBOOK } from '#/domain/playbooks/write-plan.js';
import type { DirectorConfig } from '#/schemas/director-config.js';

/** Longest a step may run, by step name; planning steps read code and write plans, so they get minutes, not seconds. */
export const DIRECTOR_STEP_TIMEOUTS_MS: DirectorConfig['step_timeouts_ms'] = {
  triage: 120_000,
  dispatch_prompt: 120_000,
  steer_reply: 120_000,
  card_chat: 120_000,
  card_survey: 300_000,
  grill_turn: 120_000,
  verify: 300_000,
  enhance: 300_000,
  write_plan: 420_000,
  approve_plan: 120_000,
  custom_step: 180_000,
  ticket_answer: 180_000,
  ticket_recover: 180_000,
  draft_agent: 120_000,
};

export const BUILTIN_DIRECTOR_CONFIG: DirectorConfig = {
  flow: [
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
      playbook_id: 'plan-grill',
      locked: false,
    },
    {
      id: 'verify',
      kind: 'verify',
      label: 'Verify against code and memory',
      enabled: true,
      when: 'always',
      depth: 'normal',
      playbook_id: 'verify-plan',
      locked: false,
    },
    {
      id: 'enhance',
      kind: 'enhance',
      label: 'Enhance the decisions',
      enabled: true,
      when: { lanes: ['standard', 'full'] },
      depth: 'normal',
      playbook_id: 'enhance-decisions',
      locked: false,
    },
    {
      id: 'write_plan',
      kind: 'write_plan',
      label: 'Write the plan',
      enabled: true,
      when: 'always',
      playbook_id: 'write-plan',
      locked: true,
    },
    {
      id: 'approve',
      kind: 'approve',
      label: 'Approve the plan',
      enabled: true,
      when: 'always',
      playbook_id: 'approve-plan',
      locked: true,
    },
  ],
  playbooks: {
    'plan-grill': PLAN_GRILL_PLAYBOOK,
    'verify-plan': VERIFY_PLAN_PLAYBOOK,
    'enhance-decisions': ENHANCE_DECISIONS_PLAYBOOK,
    'write-plan': WRITE_PLAN_PLAYBOOK,
    'plan-to-tickets': PLAN_TO_TICKETS_PLAYBOOK,
    'approve-plan': APPROVE_PLAN_PLAYBOOK,
    'answer-worker': ANSWER_WORKER_PLAYBOOK,
    'recover-failure': RECOVER_FAILURE_PLAYBOOK,
  },
  house_rules: '',
  approval_mode: 'director_or_user',
  grill: { max_questions_per_round: 8, max_rounds: 3 },
  budget_warning_usd: 5,
  read_caps: { max_files: 40, max_bytes: 400_000 },
  step_timeouts_ms: DIRECTOR_STEP_TIMEOUTS_MS,
  escalation: { director_first: true, answer_confidence: 0.8, max_director_retries: 1 },
};
