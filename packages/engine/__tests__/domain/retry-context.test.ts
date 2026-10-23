/**
 * Tests for the context a retried Worker is told: why the ticket stopped and what the last run left.
 *
 * Why: CHE-6 got an owner retry brief saying there was no previous run on record; the Worker
 *   changed nothing and the same review finding returned. The brief must carry the finding text,
 *   the escalation the owner answered, the failed checks and a short account of the last run,
 *   within a size cap, and must stay empty when there is no history so a plain retry still works.
 *
 * Pins: review findings of the latest cycle and the escalation summary appear; only blocking findings
 *   count; failed gates are listed; the last run's outcome and text are summarised; the total free
 *   text is capped; no history gives null.
 * Depends on: src/domain/retry-context, @forge/core types, vitest. No IO.
 */

import type { Interaction, StageRun } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { RETRY_CONTEXT_CAP, retryContext } from '#/domain/retry-context.js';
import type { RetryFacts } from '#/types/retry-context.types.js';

const row = (over: Partial<StageRun>): StageRun =>
  ({
    id: 1,
    ticket_id: 'CHE-6',
    stage_id: 'review',
    member_id: '',
    cycle: 0,
    kind: 'agent',
    status: 'waiting',
    outcome: {},
    started_at: '2026-10-22T19:00:00.000Z',
    ...over,
  }) as StageRun;

const review = (issue: string, severity = 'high'): StageRun['outcome'] =>
  ({
    review: {
      verdict: 'changes',
      summary: 'Changes needed',
      findings: [{ severity, file: 'src/a.ts', line: 3, issue, evidence: 'imports zod' }],
    },
  }) as StageRun['outcome'];

const escalation = {
  id: 'i1',
  ticket_id: 'CHE-6',
  kind: 'escalation',
  payload: {
    kind: 'failure',
    cause: 'rework_cap',
    summary: 'Review kept finding the zod import.',
    diagnosis: 'Rework cap of 2 reached.',
    attempts: [],
  },
  status: 'answered',
  asked_at: '2026-10-22T19:00:00.000Z',
  timeout_at: '2026-10-23T19:00:00.000Z',
  answer: { action: 'retry', by: 'owner', note: 'Drop zod' },
} as unknown as Interaction;

const facts = (over: Partial<RetryFacts> = {}): RetryFacts => ({
  escalation: null,
  stageRuns: [],
  lastRun: null,
  ...over,
});

describe('retryContext', () => {
  it('carries the finding text and the escalation summary of a held ticket', () => {
    const ctx = retryContext(
      facts({
        escalation,
        stageRuns: [
          row({ cycle: 0, outcome: review('old finding') }),
          row({ id: 2, cycle: 1, outcome: review('Do not import zod in src/a.ts') }),
        ],
      }),
    );

    expect(ctx?.findings).toContain('Do not import zod in src/a.ts');
    expect(ctx?.findings).not.toContain('old finding');
    expect(ctx?.escalation).toMatchObject({
      kind: 'failure',
      cause: 'rework_cap',
      summary: 'Review kept finding the zod import.',
      why_it_stopped: 'Rework cap of 2 reached.',
    });
  });

  it('lists failed gates and ignores low findings', () => {
    const ctx = retryContext(
      facts({
        stageRuns: [
          row({
            stage_id: 'g',
            kind: 'script_gate',
            outcome: { gate: { status: 'failed', report_ref: 'r/1' } },
          }),
          row({ id: 2, outcome: review('nit', 'low') }),
        ],
      }),
    );

    expect(ctx?.gate_failures).toContain('g gate failed (report: r/1)');
    expect(ctx?.findings).toBeUndefined();
  });

  it('summarises the last run', () => {
    const ctx = retryContext(
      facts({
        lastRun: {
          id: 'run-2',
          agent: 'implementer',
          status: 'error',
          error_family: 'crash',
          text: 'segfault',
        },
      }),
    );

    expect(ctx?.last_run).toEqual({
      run: 'run-2',
      agent: 'implementer',
      outcome: 'error (crash)',
      text: 'segfault',
    });
  });

  it('caps the free text', () => {
    const ctx = retryContext(
      facts({
        escalation,
        stageRuns: [row({ outcome: review('x'.repeat(9000)) })],
        lastRun: { id: 'run-2', status: 'success', text: 'y'.repeat(9000) },
      }),
    );

    expect(JSON.stringify(ctx).length).toBeLessThan(RETRY_CONTEXT_CAP + 1000);
  });

  it('is null with no history', () => {
    expect(retryContext(facts())).toBeNull();
  });
});
