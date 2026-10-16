/**
 * Pins: the per-call options of the Claude DirectorLLM adapter: `timeoutMs` and `onCost`.
 *
 * Why: step timeouts come from config per step, so a slow survey must get more time than a
 * quick triage and a hung child must still become a stall; and the card counts its Director
 * spend from `onCost`, so the cost has to reach it for successful and failed-after-spend
 * calls, only when the document reports one, and a broken callback must never turn a good
 * answer into a failure.
 *
 * Depends on: helpers/director-llm-rig (runs helpers/fake-claude.mjs under node), src/index.
 */

import type { StepError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makeDirectorRig, resultDoc } from '#tests/helpers/director-llm-rig.js';
import { waitFor } from '#tests/helpers/wait-for.js';

const Answer = z.object({ answer: z.string().min(1) });
const OPTS = { model: 'haiku', budgetUsd: 0.05 };
const j = JSON.stringify;

const errorOf = (r: { ok: boolean; error?: StepError }): StepError => {
  expect(r.ok).toBe(false);

  return r.error as StepError;
};

describe('Claude DirectorLLM: per-call timeout', { timeout: 30_000 }, () => {
  it('a per-call timeoutMs shorter than the default kills the child and stalls', async () => {
    const rig = makeDirectorRig({ timeoutMs: 60_000 });
    rig.fixture('', { hang: true });
    const pending = rig.llm.step('triage', {}, Answer, { ...OPTS, timeoutMs: 2_000 });
    await waitFor(() => rig.started(), 'fake claude started');
    await rig.clock.advance(2_000);
    const e = errorOf(await pending);
    expect(e.kind).toBe('stall');
    expect(e.message).toContain('2000ms');
    expect(rig.kills.length).toBe(1);
  });
});

describe('Claude DirectorLLM: cost reporting', { timeout: 30_000 }, () => {
  it('calls onCost once with the cost the result document reports', async () => {
    const rig = makeDirectorRig();
    rig.fixture(
      j(resultDoc({ structured_output: { answer: 'ok' }, total_cost_usd: 0.0123 })),
    );

    const costs: number[] = [];
    const r = await rig.llm.step('triage', {}, Answer, {
      ...OPTS,
      onCost: (usd) => costs.push(usd),
    });

    expect(r.ok).toBe(true);
    expect(costs).toEqual([0.0123]);
  });

  it('calls onCost for a call that failed after spending', async () => {
    const rig = makeDirectorRig();
    rig.fixture(
      j(
        resultDoc({
          subtype: 'error_max_budget_usd',
          is_error: true,
          total_cost_usd: 0.05,
        }),
      ),
    );

    const costs: number[] = [];
    const r = await rig.llm.step('triage', {}, Answer, {
      ...OPTS,
      onCost: (usd) => costs.push(usd),
    });

    expect(errorOf(r).kind).toBe('budget');
    expect(costs).toEqual([0.05]);
  });

  it('does not call onCost when the document has no cost', async () => {
    const rig = makeDirectorRig();
    rig.fixture(
      j(resultDoc({ structured_output: { answer: 'ok' }, total_cost_usd: undefined })),
    );

    const costs: number[] = [];
    await rig.llm.step('triage', {}, Answer, {
      ...OPTS,
      onCost: (usd) => costs.push(usd),
    });

    expect(costs).toEqual([]);
  });

  it('ignores a throwing onCost, keeps the result and logs a warning', async () => {
    const logs: string[] = [];
    const rig = makeDirectorRig({ log: (level, msg) => logs.push(`${level}:${msg}`) });
    rig.script({ kind: 'valid', value: { answer: 'ok' } });
    const r = await rig.llm.step('triage', {}, Answer, {
      ...OPTS,
      onCost: () => {
        throw new Error('sink down');
      },
    });

    expect(r).toEqual({ ok: true, value: { answer: 'ok' } });
    expect(logs.some((l) => l.startsWith('warn:'))).toBe(true);
  });
});
