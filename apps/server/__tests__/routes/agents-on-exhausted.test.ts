/**
 * What an agent does when every place it can run has failed, through the agent editor's API.
 *
 * Why: "when every fallback fails" is the owner's choice per agent (d-0080): let the Director pick a substitute, or
 *   pause and tell the owner. It lives in the agent's `runs_on` as an optional key that is only written when the
 *   owner picks something, so every stored agent keeps its hash (a changed hash would read as an edited agent
 *   everywhere). Both company agents and a project's overrides of a company agent's `runs_on` carry it.
 *
 * Pins: a custom agent saved with `on_exhausted: 'pause'` reads back with it; an agent saved without the key reads
 *   back without it and keeps the same hash as before the key existed; an unknown value is 400 invalid_request; a
 *   project override of a company agent's `runs_on` carries the choice into the project's effective agent.
 * Depends on: helpers/agent-rig. IO: a loopback socket and in-memory storage.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WHO, agentBody, startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

let rig: AgentRig;

const call = (method: string, path: string, body?: unknown) =>
  rig.http.json(method, path, body);

const runsOn = (extra: Record<string, unknown> = {}) => ({
  harness: 'project_default',
  model: { kind: 'harness_default' },
  fallbacks: [],
  ...extra,
});

type AgentRow = {
  id: string;
  hash: string;
  definition: { runs_on: Record<string, unknown> };
};
const listed = async (path: string): Promise<AgentRow[]> =>
  ((await call('GET', path)).body as { agents: AgentRow[] }).agents;

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('runs_on.on_exhausted', () => {
  it('is stored when chosen and absent when not, and an agent without it keeps its hash', async () => {
    const plain = await call('POST', '/settings/agents', {
      agent: agentBody({ name: 'Plain writer', runs_on: runsOn() }),
      origin: 'custom',
      expected_version: 0,
      ...WHO,
    });

    expect(plain.status).toBe(200);

    const paused = await call('POST', '/settings/agents', {
      agent: agentBody({
        name: 'Careful writer',
        runs_on: runsOn({ on_exhausted: 'pause' }),
      }),
      origin: 'custom',
      expected_version: 1,
      ...WHO,
    });

    expect(paused.status).toBe(200);
    const agents = await listed('/settings/agents');
    const a = agents.find((x) => x.id === (plain.body as { id: string }).id);
    const b = agents.find((x) => x.id === (paused.body as { id: string }).id);

    expect(a?.definition.runs_on).not.toHaveProperty('on_exhausted');
    expect(b?.definition.runs_on['on_exhausted']).toBe('pause');
    expect(a?.hash).not.toBe(b?.hash);
  });

  it('refuses a value that is neither choice', async () => {
    const res = await call('POST', '/settings/agents', {
      agent: agentBody({ runs_on: runsOn({ on_exhausted: 'ignore' }) }),
      origin: 'custom',
      expected_version: 0,
      ...WHO,
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('invalid_request');
  });

  it('is carried by a project override of a company agent', async () => {
    const res = await call('PUT', '/settings/projects/demo/agents/implementer', {
      override: { runs_on: runsOn({ on_exhausted: 'pause' }) },
      expected_version: 0,
      ...WHO,
    });

    expect(res.status).toBe(200);
    const mine = (await listed('/settings/projects/demo/agents')).find(
      (x) => x.id === 'implementer',
    );

    expect(mine?.definition.runs_on['on_exhausted']).toBe('pause');
    const company = (await listed('/settings/agents')).find(
      (x) => x.id === 'implementer',
    );

    expect(company?.definition.runs_on).not.toHaveProperty('on_exhausted');
  });
});
