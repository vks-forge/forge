/**
 * Pins the conflict clause of the Worker contract: present on a conflict run, absent everywhere else.
 *
 * Why: a Worker that resolves a clash with main must be told, in fixed words, to keep both intents,
 *   remove every marker and claim every edit; paraphrased by a model it would be dropped. The clause
 *   must never reach an ordinary run: the Express dispatch brief is pinned byte for byte by a golden
 *   file, and a conflict run is not "rejected by the gates", so it gets no gate-rework note.
 *
 * Pins: workerContract({ conflict }) adds `conflict_note` and drops `rework_note`; every other call
 *   has no `conflict_note`; the clause renders into the prompt only when set.
 * Depends on: domain/worker-contract, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import {
  CONFLICT_RULE,
  renderWorkerContract,
  workerContract,
} from '#/domain/worker-contract.js';

describe('worker contract: conflict clause', () => {
  it('adds the clause on a conflict run and drops the gate-rework note', () => {
    const c = workerContract({ rework: true, conflict: true, lane: 'express' });

    expect(c.conflict_note).toBe(CONFLICT_RULE);
    expect(c.rework_note).toBeUndefined();
    expect(renderWorkerContract(c)).toContain('remove every marker line');
    expect(renderWorkerContract(c)).toContain('claim every file you edit');
    expect(renderWorkerContract(c)).toContain('Keep both intents');
  });

  it.each([
    { rework: false },
    { rework: true },
    { rework: false, conflict: false },
    { rework: false, lane: 'standard' as const },
  ])('has no clause when there is no conflict (%o)', (opts) => {
    const c = workerContract(opts);

    expect('conflict_note' in c).toBe(false);
    expect(renderWorkerContract(c)).not.toContain('conflict markers');
  });
});
