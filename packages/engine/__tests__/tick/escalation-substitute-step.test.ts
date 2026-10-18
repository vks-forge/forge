/**
 * Pins that the Director can only name an agent the engine offered, and that scorecards are read from true rows.
 *
 * Why: when a stage's agent and every fallback failed, the Director may pick another agent, but a model can be
 *   talked into naming anything, so the engine builds the candidate list (same role, usable, ready) and refuses
 *   a pick outside it: the item goes to the owner and nothing is swapped. The same step is shown each
 *   candidate's scorecard, which is computed on read from the project's tickets, their pipeline copies, stage rows
 *   and runs; the loader must bring exactly those rows, in batches, and the arithmetic over them must match what
 *   happened, or the Director (and the owner) would choose by a wrong record.
 *
 * Pins: the engine refuses a pick outside the candidate list (no swap, item with the owner); the step input holds
 *   the same-role usable agents only, each with a scorecard row (null before any history); the scorecard loader
 *   reads a finished Express ticket's snapshot, stage rows and run and the card shows its clean run.
 * Depends on: helpers/rig, helpers/verify-rig, src/tick/scorecards, @forge/core, vitest.
 */

import { BUILTIN_AGENTS, computeScorecards, effectiveAgents } from '@forge/core';
import type { AgentDefinition } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { pendingOf } from '#tests/helpers/escalation-rig.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';
import { drive, makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';
import { loadScorecardInput } from '#/tick/scorecards.js';

const RETRY = {
  rate_limit: { base_ms: 1000, max_ms: 8000, max_attempts: 1 },
  crash: { delay_ms: 1000, max_attempts: 1 },
  stall: { delay_ms: 1000, max_attempts: 1 },
  unknown: { delay_ms: 1000, max_attempts: 1 },
};

const custom = (
  role: AgentDefinition['role'],
  name: string,
  scope: string[],
): AgentDefinition => ({
  ...(BUILTIN_AGENTS[
    role === 'reviewer' ? 'reviewer' : 'implementer'
  ] as AgentDefinition),
  name,
  role,
  write_scope: scope,
  origin: 'custom',
});

async function exhaust(rig: Rig): Promise<string> {
  const current = await rig.config.project('forge');
  await rig.config.append({
    scope: 'project',
    project: 'forge',
    doc: {
      ecosystems: ['node'],
      default_harness: 'scripted',
      checks: [{ name: 'test', role: 'test', command: 'pnpm test' }],
      agents: {
        custom: {
          'frontend-writer': custom('writer', 'Frontend', ['apps/web/**']),
          'spare-reviewer': custom('reviewer', 'Spare reviewer', []),
          'off-writer': { ...custom('writer', 'Off', ['docs/**']), archived: true },
        },
      },
    } as never,
    author: 'test',
    reason: 'substitute scenario',
    expectedVersion: current.version.project,
  });

  const id = await rig.request('Fix it');
  await rig.tick();
  const limited = makeResult({ status: 'error', errorFamily: 'rate_limit' });
  rig.driver.finish('run-1', limited);
  await rig.flush();
  await rig.tick();
  rig.clock.advance(2_000);
  await rig.tick();
  rig.driver.finish('run-2', limited);
  await rig.flush();
  await rig.tick();
  await rig.tick();

  return id;
}

describe('the candidate list the Director picks from', () => {
  it('holds the same-role usable agents only, each with a scorecard row or null', async () => {
    const rig = await makeRig({ engine: { retry: RETRY } });
    rig.llm.script('pick_substitute', {
      decision: 'pause',
      reason: 'No good fit for this stage.',
    });

    await exhaust(rig);

    const input = rig.llm.callsTo('pick_substitute')[0]!.input as {
      candidates: { id: string; role: string; card: unknown }[];
      playbook: { id: string } | null;
    };

    // The archived writer, the reviewer (another role) and the failed implementer itself are not offered.
    expect(input.candidates.map((c) => c.id)).toEqual(['frontend-writer']);
    expect(input.candidates[0]).toMatchObject({ role: 'writer', family: 'claude' });
    expect(input.candidates[0]?.card).toMatchObject({
      by: 'all',
      tickets: 0,
      clean_rate: null,
    });

    expect(input.playbook?.id).toBe('pick-substitute');
  });

  it('refuses a pick outside the list: nothing is swapped and the owner holds the item', async () => {
    const rig = await makeRig({ engine: { retry: RETRY } });
    // The reviewer exists and is usable, but it is not a candidate for a writer's stage.
    rig.llm.script('pick_substitute', {
      decision: 'substitute',
      agent: 'spare-reviewer',
      reason: 'It looked like a good fit to me.',
    });

    const id = await exhaust(rig);
    const snap = await rig.storage.transaction((tx) => tx.ticketPipelines.get(id));
    const [item] = await pendingOf(rig, id, 'failure');

    expect(snap?.adjustments).toEqual([]);
    expect(snap?.definition.stages[0]).toMatchObject({ agent: 'implementer' });
    expect(item?.escalated_at).toBeDefined();
    expect(item?.payload).toMatchObject({ cause: 'no_agent_available' });
    expect((await rig.ticket(id)).status).toBe('waiting_human');
  });
});

describe('the scorecard loader', () => {
  it('reads a finished ticket whole and the card shows its clean run', async () => {
    const { rig } = await makeVerifyRig({ tier: 'A' });
    const id = await startAndFinish(rig, [{ kind: 'edited', path: 'src/a.ts' }]);
    await drive(rig, 12, async () => (await rig.ticket(id)).status === 'done');

    const project = (await rig.storage.transaction((tx) => tx.projects.list()))[0]!;
    const roster = effectiveAgents({ ...BUILTIN_AGENTS }, undefined, () => ({
      ready: true,
      reasons: [],
    }));

    const input = await rig.storage.transaction((tx) =>
      loadScorecardInput(tx, {
        project: project.id,
        roster,
        now: rig.clock.now(),
        range: '30d',
      }),
    );

    expect(input.tickets.map((t) => t.id)).toEqual([id]);
    expect(input.snapshots).toHaveLength(1);
    expect(input.rows.map((r) => r.stage_id)).toEqual(['implementer', 'g1']);
    expect(input.runs).toHaveLength(1);
    expect(input.marks).toEqual([]);

    const row = computeScorecards(input).agents.find((a) => a.agent_id === 'implementer')
      ?.rows[0];

    expect(row).toMatchObject({
      tickets: 1,
      runs: 1,
      insufficient: true,
      clean_rate: { hits: 1, total: 1, rate: 1 },
    });
  });

  it('reads nothing outside the window', async () => {
    const { rig } = await makeVerifyRig({ tier: 'A' });
    const id = await startAndFinish(rig, [{ kind: 'edited', path: 'src/a.ts' }]);
    await drive(rig, 12, async () => (await rig.ticket(id)).status === 'done');
    const project = (await rig.storage.transaction((tx) => tx.projects.list()))[0]!;

    const input = await rig.storage.transaction((tx) =>
      loadScorecardInput(tx, {
        project: project.id,
        roster: [],
        now: rig.clock.now() + 40 * 86_400_000,
        range: '30d',
      }),
    );

    expect(input.tickets).toEqual([]);
    expect(input.rows).toEqual([]);
  });
});
