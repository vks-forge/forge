/**
 * Pins when the Director turns a repeated pipeline change into a proposal for the owner.
 *
 * Why: the Director never edits a project's lane list (d-0151). When the same change was applied to enough
 *   tickets from enough cards on the same base list, it records one proposal for the owner to accept or
 *   reject. No model decides that: the rule is a count over the tickets' own copies. It must not be noise (three
 *   tickets of one card are one decision, not a habit), must not repeat (a fourth ticket adds nothing, and a
 *   rejected key stays suppressed for that base), and a changed lane list starts a fresh count.
 *
 * Pins: Done-when 6 as far as the engine goes: the same op on 3 tickets from 2 cards inside the window gives
 *   one pending proposal with three quoted reasons and the project's list with the op applied; a 4th ticket adds
 *   none; 3 tickets of one card give none; a rejected key is not proposed again; a lane edited since starts a new
 *   count. (Accept, reject and stale through the owner's door are pinned in the server's proposal route tests.)
 * Depends on: helpers/planning-rig, @forge/core, vitest.
 */

import { BUILTIN_AGENTS, BUILTIN_PIPELINES, pipelineHash } from '@forge/core';
import type { AgentDefinition } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  planUntilDecision,
  planningRig,
  scriptTodo,
  todoPlan,
  tickets,
} from '#tests/helpers/planning-rig.js';
import type { Rig } from '#tests/helpers/rig.js';

const WHY = 'The change touches the session token check.';
const addSecurity = {
  op: 'add',
  stage: {
    id: 'dir-security',
    kind: 'agent',
    label: 'Security review',
    agent: 'security-reviewer',
  },
  after: 'g1',
  reason: WHY,
};

async function setProject(rig: Rig, pipelines?: Record<string, unknown>): Promise<void> {
  const current = await rig.config.project('forge');
  await rig.config.append({
    scope: 'project',
    project: 'forge',
    doc: {
      default_harness: 'scripted',
      agents: {
        custom: {
          'security-reviewer': {
            ...(BUILTIN_AGENTS['reviewer'] as AgentDefinition),
            name: 'Security reviewer',
            origin: 'custom',
          },
        },
      },
      ...(pipelines ? { pipelines } : {}),
    },
    author: 'test',
    reason: 'proposal scenario',
    expectedVersion: current.version.project,
  });
}

/** A card whose plan has one Standard ticket per file, each carrying the same op. */
async function card(rig: Rig, files: string[]): Promise<string> {
  const ticket = (file: string, i: number) => ({
    key: `t${i + 1}`,
    title: `Change ${file}`,
    body: `Edit ${file}.`,
    acceptance: ['done'],
    priority: 'normal',
    depends_on: [],
    lane: 'standard',
    size: 'S',
    files: [file],
    pipeline: { ops: [addSecurity] },
  });

  scriptTodo(rig, { write_plan: [todoPlan({ tickets: files.map(ticket) })] });

  const id = await planUntilDecision(rig);
  await rig.tick();

  return id;
}

const proposals = (rig: Rig) =>
  rig.storage.transaction((tx) => tx.pipelineProposals.list('forge'));

async function rigWithRoom() {
  const rig = await planningRig({
    engine: {
      max_concurrent_global: 8,
      max_concurrent_per_project: 8,
      max_concurrent_per_harness: { default: 8, by_id: {} },
      max_concurrent_by_state: { in_progress: 8, verifying: 1 },
    },
  });

  await setProject(rig);

  return rig;
}

describe('a repeated change becomes one proposal', () => {
  it('proposes after 3 tickets from 2 cards, with three quoted reasons and the lane list with the op applied', async () => {
    const rig = await rigWithRoom();
    const first = await card(rig, ['src/a1.ts', 'src/a2.ts']);

    expect(await proposals(rig)).toEqual([]);

    const second = await card(rig, ['src/b1.ts']);
    const [p, ...more] = await proposals(rig);

    expect(more).toEqual([]);
    expect(p).toMatchObject({
      project: 'forge',
      lane: 'standard',
      key: 'standard:add:security-reviewer@after:g1',
      base_hash: pipelineHash(BUILTIN_PIPELINES.standard),
      status: 'pending',
      count: 3,
    });

    expect(p?.op).toEqual(addSecurity);
    expect(p?.proposed.stages.map((s) => s.id)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'dir-security',
      'reviewer',
      'merge',
    ]);

    expect(p?.evidence).toHaveLength(3);
    expect(p?.evidence.every((e) => e.reason === WHY)).toBe(true);
    const ownCards = new Set([
      ...(await tickets(rig, first as never)).map((t) => t.id),
      ...(await tickets(rig, second as never)).map((t) => t.id),
    ]);

    expect(p?.evidence.every((e) => ownCards.has(e.ticket_id))).toBe(true);
  });

  it('adds nothing for a fourth ticket, and nothing for a rejected key', async () => {
    const rig = await rigWithRoom();
    await card(rig, ['src/a1.ts', 'src/a2.ts']);
    await card(rig, ['src/b1.ts']);
    const [p] = await proposals(rig);

    await card(rig, ['src/c1.ts']);

    expect(await proposals(rig)).toHaveLength(1);

    await rig.storage.transaction((tx) =>
      tx.pipelineProposals.decide(p!.id, {
        status: 'rejected',
        reason: 'not for this project',
        at: new Date(rig.clock.now()).toISOString(),
      }),
    );

    await card(rig, ['src/d1.ts']);

    expect(await proposals(rig)).toHaveLength(1);
    expect((await proposals(rig))[0]?.status).toBe('rejected');
  });

  it('is not proposed for three tickets of one card', async () => {
    const rig = await rigWithRoom();
    await card(rig, ['src/a1.ts', 'src/a2.ts', 'src/a3.ts']);

    expect(await proposals(rig)).toEqual([]);
  });

  it('starts a new count when the owner edits the lane list', async () => {
    const rig = await rigWithRoom();
    await card(rig, ['src/a1.ts', 'src/a2.ts']);
    // The owner changes Standard (drops nothing the op needs): the base list is now another one.
    await setProject(rig, {
      standard: {
        stages: [
          ...BUILTIN_PIPELINES.standard.stages.slice(0, 4),
          { id: 'critic', kind: 'agent', label: 'Critique', agent: 'critic' },
          BUILTIN_PIPELINES.standard.stages[4],
        ],
      },
    });

    await card(rig, ['src/b1.ts']);

    expect(await proposals(rig)).toEqual([]);
  });
});
