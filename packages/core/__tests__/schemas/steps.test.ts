/**
 * Tests for the Director step output schemas.
 *
 * Why: every Director LLM step is a finite call whose output is parsed before anything
 *   acts on it (director-core.md §5). A triage answer with a lane outside the closed set,
 *   a confidence of 7 or an empty prompt must be rejected here, so the engine logs a
 *   rejected step instead of writing garbage to a ticket.
 *
 * Pins: TriageOutput, DispatchPromptOutput, SteerReplyOutput accept the documented shapes and
 *   reject out-of-range or empty values; NewRequestPayload requires text.
 * Depends on: src/schemas/steps, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  DispatchPromptOutput,
  NewRequestPayload,
  STEP_NAMES,
  SteerReplyOutput,
  TriageOutput,
} from '#/schemas/steps.js';

describe('TriageOutput', () => {
  const good = {
    lane: 'express',
    confidence: 0.9,
    predicted_files: ['src/a.ts'],
    questions: [],
    type: 'fix',
    tier_predicted: 'A',
    title: 'Fix the doctor check',
  };

  it('accepts a complete answer', () => {
    expect(TriageOutput.safeParse(good).success).toBe(true);
  });

  it('rejects a lane outside the closed set and a confidence outside 0..1', () => {
    expect(TriageOutput.safeParse({ ...good, lane: 'huge' }).success).toBe(false);
    expect(TriageOutput.safeParse({ ...good, confidence: 7 }).success).toBe(false);
  });
});

describe('DispatchPromptOutput / SteerReplyOutput', () => {
  it('requires a non-empty prompt', () => {
    expect(DispatchPromptOutput.safeParse({ prompt: 'do it' }).success).toBe(true);
    expect(DispatchPromptOutput.safeParse({ prompt: '' }).success).toBe(false);
  });

  it('accepts the four steer modes and rejects others', () => {
    for (const mode of ['steer', 'follow_up', 'interrupt', 'none']) {
      expect(SteerReplyOutput.safeParse({ mode, text: 'x' }).success).toBe(true);
    }

    expect(SteerReplyOutput.safeParse({ mode: 'shout', text: 'x' }).success).toBe(false);
  });
});

describe('NewRequestPayload / STEP_NAMES', () => {
  it('needs text and allows a quick or full hint', () => {
    expect(NewRequestPayload.safeParse({ text: 'fix typo', hint: 'quick' }).success).toBe(
      true,
    );

    expect(NewRequestPayload.safeParse({ hint: 'quick' }).success).toBe(false);
  });

  it('names the ticket steps, the card planning steps, the escalation steps and draft_agent', () => {
    expect([...STEP_NAMES]).toEqual([
      'triage',
      'dispatch_prompt',
      'steer_reply',
      'card_chat',
      'card_survey',
      'grill_turn',
      'verify',
      'enhance',
      'write_plan',
      'approve_plan',
      'custom_step',
      'ticket_answer',
      'ticket_recover',
      'draft_agent',
      'ticket_check',
      'pick_substitute',
    ]);
  });
});
