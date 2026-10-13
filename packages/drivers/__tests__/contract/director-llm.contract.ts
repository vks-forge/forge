/**
 * Contract every `DirectorLLM` must pass: `describeDirectorLLMContract(name, make)`.
 *
 * Why: the Director asks a model for judgement in small steps and acts on the typed answer
 *   alone. It retries an off-schema answer once, backs off on a rate limit until the
 *   reported reset, parks the ticket on auth or budget and never retries a refusal, so the
 *   port must turn every model or process failure into the same `StepError` kind whichever
 *   implementation sits behind it, and must never throw for one. This contract is that
 *   behaviour; a new DirectorLLM passes it before it gets tests of its own (code.md rule 8).
 *
 * Exports: DirectorLLMHarness, ScriptedResponse, describeDirectorLLMContract().
 * Depends on: vitest, zod, @forge/core (DirectorLLM). No IO of its own.
 */

import type { DirectorLLM, StepOptions } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

/** What the next `step` call receives from the model side. */
export type ScriptedResponse =
  | { readonly kind: 'valid'; readonly value: { readonly answer: string } }
  | { readonly kind: 'off_schema' }
  | { readonly kind: 'rate_limit' }
  | { readonly kind: 'auth' }
  | { readonly kind: 'budget' }
  | { readonly kind: 'refusal' }
  | { readonly kind: 'crash' };

export interface DirectorLLMHarness {
  readonly llm: DirectorLLM;
  /** Arranges what the next step call gets back. */
  script(response: ScriptedResponse): Promise<void> | void;
  /** Epoch ms the implementation's clock reads, so a reset time can be compared. */
  now(): number;
  close(): Promise<void>;
}

const Answer = z.object({ answer: z.string().min(1) });
const OPTS: StepOptions = { model: 'haiku', budgetUsd: 0.05 };

export function describeDirectorLLMContract(
  name: string,
  make: () => Promise<DirectorLLMHarness>,
): void {
  // 30s per case: the Claude adapter runs a real node child process, slow under a loaded suite.
  describe(`DirectorLLM contract: ${name}`, { timeout: 30_000 }, () => {
    let h: DirectorLLMHarness;
    beforeEach(async () => {
      h = await make();
    });

    afterEach(async () => {
      await h.close();
    });

    const run = () => h.llm.step('dispatch_prompt', { text: 'hi' }, Answer, OPTS);

    it('declares stable capabilities', () => {
      const caps = h.llm.capabilities();
      expect(typeof caps.structuredOutput).toBe('boolean');
      expect(typeof caps.reportsCost).toBe('boolean');
      expect(h.llm.capabilities()).toEqual(caps);
    });

    it('returns the typed value for a valid answer', async () => {
      await h.script({ kind: 'valid', value: { answer: 'ok' } });
      const r = await run();
      expect(r).toEqual({ ok: true, value: { answer: 'ok' } });
    });

    it('rejects an off-schema answer as invalid_output with a message', async () => {
      await h.script({ kind: 'off_schema' });
      const r = await run();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.kind).toBe('invalid_output');
        expect(r.error.message.length).toBeGreaterThan(0);
      }
    });

    it('reports a rate limit with an ISO retryNotBefore in the future', async () => {
      await h.script({ kind: 'rate_limit' });
      const r = await run();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.kind).toBe('rate_limit');
        const at = r.error.retryNotBefore;
        expect(at).toBeDefined();
        expect(new Date(at as string).toISOString()).toBe(at);
        expect(Date.parse(at as string)).toBeGreaterThan(h.now());
      }
    });

    it.each([
      ['auth', 'auth'],
      ['budget', 'budget'],
      ['refusal', 'refusal'],
    ] as const)('maps %s to the %s family', async (scripted, kind) => {
      await h.script({ kind: scripted });
      const r = await run();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.kind).toBe(kind);
      }
    });

    it('maps a dead process to crash and never throws', async () => {
      await h.script({ kind: 'crash' });
      const r = await run();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(['crash', 'unknown']).toContain(r.error.kind);
      }
    });

    it('does not throw for any scripted failure', async () => {
      for (const kind of ['rate_limit', 'auth', 'budget', 'refusal', 'crash'] as const) {
        await h.script({ kind });
        await expect(run()).resolves.toBeDefined();
      }
    });
  });
}
