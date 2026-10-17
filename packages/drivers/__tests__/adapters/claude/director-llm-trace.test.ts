/**
 * Pins: the `onTrace` callback of the Claude DirectorLLM adapter.
 *
 * Why: to debug a card the owner must see exactly what the model was asked and exactly what
 * it printed, including when the answer was off-schema or the call failed. The adapter is
 * the only place that knows the rendered prompt and the raw document, so it hands both to the
 * composition through one optional callback (d-0163). The callback must never change a step's
 * result: a throwing one is ignored, and with none given nothing changes.
 *
 * Depends on: helpers/director-llm-rig (runs helpers/fake-claude.mjs under node), src/index.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { DirectorStepTrace } from '#/types/claude/director-llm.types.js';
import { makeDirectorRig, resultDoc } from '#tests/helpers/director-llm-rig.js';

const Answer = z.object({ answer: z.string().min(1) });
const OPTS = { model: 'haiku', budgetUsd: 0.05 };
const j = JSON.stringify;

describe('Claude DirectorLLM: onTrace', { timeout: 30_000 }, () => {
  it('hands over the rendered prompt and the raw output of a good call', async () => {
    const seen: DirectorStepTrace[] = [];
    const rig = makeDirectorRig({ onTrace: (t) => seen.push(t) });
    const doc = j(resultDoc({ structured_output: { answer: 'ok' } }));
    rig.fixture(doc);

    const r = await rig.llm.step('triage', { text: 'UNIQUE-INPUT' }, Answer, OPTS);

    expect(r.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.step).toBe('triage');
    expect(seen[0]?.prompt).toContain('UNIQUE-INPUT');
    expect(seen[0]?.raw.trim()).toBe(doc);
  });

  it('hands over the raw output of an off-schema answer too', async () => {
    const seen: DirectorStepTrace[] = [];
    const rig = makeDirectorRig({ onTrace: (t) => seen.push(t) });
    rig.fixture(j(resultDoc({ structured_output: { nope: 1 } })));

    const r = await rig.llm.step('triage', {}, Answer, OPTS);

    expect(r.ok).toBe(false);
    expect(seen[0]?.raw).toContain('nope');
  });

  it('ignores a callback that throws', async () => {
    const rig = makeDirectorRig({
      onTrace: () => {
        throw new Error('boom');
      },
    });

    rig.fixture(j(resultDoc({ structured_output: { answer: 'ok' } })));

    const r = await rig.llm.step('triage', {}, Answer, OPTS);

    expect(r.ok).toBe(true);
  });
});
