/**
 * Builders for the memory tests: a project of many decisions and a bare engine context over the scripted model.
 *
 * Why: the memory context and the rewrite step are driven by the size of a project's memory and by a model
 *   that may be slow, wrong or out of budget. These helpers make a project of any size (a few pinned records,
 *   some tagged ones, some rejected approaches) and an `EngineCtx` over the scripted model and the fake
 *   index, without running a whole tick, so each test states the one situation it pins.
 *
 * Exports: manyRecords(), memoryCtx().
 * Depends on: @forge/core, helpers/fake-memory-index, helpers/scripted-llm. No IO.
 */

import { BUILTIN_FORGE_CONFIG } from '@forge/core';
import { createFakeMemoryIndex } from '#tests/helpers/fake-memory-index.js';
import type { FakeMemoryRecord } from '#tests/helpers/fake-memory-index.js';
import { createScriptedLLM } from '#tests/helpers/scripted-llm.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** `decisions` active decisions (ids d-0001..), `rejected` rejected approaches (r-0001..), the first `pinned` pinned. */
export function manyRecords(
  decisions: number,
  rejected = 0,
  pinned = 0,
): FakeMemoryRecord[] {
  const out: FakeMemoryRecord[] = [];
  for (let i = 1; i <= decisions; i++) {
    out.push({
      id: `d-${String(i).padStart(4, '0')}`,
      kind: 'decision',
      statement: `Decision number ${i} about topic${i}.`,
      tags: [i % 2 === 0 ? 'even' : 'odd'],
      pinned: i <= pinned,
    });
  }

  for (let i = 1; i <= rejected; i++) {
    out.push({
      id: `r-${String(i).padStart(4, '0')}`,
      kind: 'rejected',
      statement: `Rejected approach ${i} about reject${i}.`,
      tags: [i % 2 === 0 ? 'even' : 'odd'],
    });
  }

  return out;
}

/** A context over the scripted model and a fake index holding `records`; `memory` settings may be overridden. */
export function memoryCtx(
  records: readonly FakeMemoryRecord[],
  memory: Record<string, unknown> = {},
) {
  const llm = createScriptedLLM();
  const index = createFakeMemoryIndex(records);
  const traces: { message: string; data: unknown }[] = [];
  const deps = {
    llm: llm.llm,
    memory: { slice: async () => ({ decisions: [], rejected: [] }) },
    memoryIndex: index,
    trace: { emit: (e: { message: string; data: unknown }) => traces.push(e) },
  } as unknown as EngineDeps;

  const forge = {
    ...BUILTIN_FORGE_CONFIG,
    director: {
      ...BUILTIN_FORGE_CONFIG.director,
      memory: { ...BUILTIN_FORGE_CONFIG.director.memory, ...memory },
    },
  };

  const ctx = {
    deps,
    state: { holds: new Map() },
    report: { rejectedSteps: [] },
    config: { forge, companyVersion: 1, projects: new Map(), unservable: new Map() },
    now: 0,
    nowIso: '2026-10-18T00:00:00.000Z',
  } as unknown as EngineCtx;

  return { ctx, llm, index, traces };
}
