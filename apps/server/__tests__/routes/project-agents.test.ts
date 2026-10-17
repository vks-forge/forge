/**
 * The project agent API: the effective roster, project agents, overrides, disable and enable.
 *
 * Why: a project may add agents of its own, switch a company agent off and override two things
 *   on a company agent, its instructions and where it runs (d-0149). The screen relies on the
 *   server for the effective list and its tags, for refusing every other per-project change
 *   with `override_fields` instead of dropping it, for keeping the implementer on, and for
 *   storing an override as only what differs so Reset to the company default is removing it.
 *
 * Pins: GET with both version counters and 404 project_not_found; POST creates a project agent;
 *   PUT of a company agent stores a trimmed override and 400 override_fields for anything else;
 *   PUT of a project agent replaces it; reset-override 409 not_overridden; disable and enable
 *   with 409 agent_in_pipeline for an agent a lane pipeline names (the implementer); archive of a project agent and 409
 *   builtin_locked for a company one; 409 version_conflict.
 * Depends on: helpers/agent-rig. IO: a loopback socket.
 */

import type { ConfigVersion, ProjectOverride } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WHO, agentBody, startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

let rig: AgentRig;

const base = '/settings/projects/demo/agents';
const call = (method: string, path: string, body?: unknown) =>
  rig.http.json(method, path, body);

const at = (expected_version: number, extra: Record<string, unknown> = {}) => ({
  expected_version,
  ...WHO,
  ...extra,
});

type View = {
  id: string;
  scope: string;
  tags: string[];
  definition: { instructions: string };
};
const agentsOf = (r: { body: unknown }): View[] => (r.body as { agents: View[] }).agents;
const errorOf = (r: { body: unknown }): { code: string } =>
  (r.body as { error: { code: string } }).error;

const storedDoc = async (): Promise<ProjectOverride> => {
  const last = (await rig.config.history('project', 'demo')).at(-1) as
    ConfigVersion | undefined;

  return (last?.doc ?? {}) as ProjectOverride;
};

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('GET /settings/projects/:slug/agents', () => {
  it('lists the company agents with both version counters', async () => {
    const res = await call('GET', base);

    expect(res.status).toBe(200);
    expect((res.body as { version: unknown }).version).toEqual({
      company: 0,
      project: 0,
    });

    expect(agentsOf(res).map((a) => a.id)).toEqual([
      'implementer',
      'test-writer',
      'reviewer',
      'critic',
    ]);
  });

  it('answers 404 project_not_found for an unknown project', async () => {
    const res = await call('GET', '/settings/projects/ghost/agents');

    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('project_not_found');
  });
});

describe('project agents', () => {
  const create = (over: Record<string, unknown> = {}, expected = 0) =>
    call('POST', base, { agent: agentBody(over), origin: 'custom', ...at(expected) });

  it('creates a project agent tagged project and answers with the fresh list', async () => {
    const res = await create();
    const mine = agentsOf(res).find((a) => a.id === 'docs-helper');

    expect(res.status).toBe(200);
    expect(mine).toMatchObject({ scope: 'project', tags: ['project'] });
    expect((res.body as { version: unknown }).version).toEqual({
      company: 0,
      project: 1,
    });
  });

  it('refuses a name a company agent already uses', async () => {
    const res = await create({
      name: 'Critic',
      role: 'reviewer',
      tools: ['read'],
      write_scope: [],
    });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('name_taken');
  });

  it('saves a project agent whole and archives it, keeping it listed', async () => {
    await create();
    const saved = await call('PUT', `${base}/docs-helper`, {
      agent: agentBody({ instructions: 'Longer.' }),
      ...at(1),
    });

    expect(
      agentsOf(saved).find((a) => a.id === 'docs-helper')?.definition.instructions,
    ).toBe('Longer.');

    const archived = await call('POST', `${base}/docs-helper/archive`, at(2));

    expect(agentsOf(archived).find((a) => a.id === 'docs-helper')?.tags).toEqual([
      'project',
      'archived',
    ]);
  });

  it('answers 409 version_conflict for a stale project version', async () => {
    await create();
    const res = await create({ name: 'Other' }, 0);

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('version_conflict');
  });
});

describe('overrides of a company agent', () => {
  const override = (id: string, body: Record<string, unknown>, expected = 0) =>
    call('PUT', `${base}/${id}`, { ...body, ...at(expected) });

  it('stores only the instructions that differ and tags the agent overridden', async () => {
    const res = await override('reviewer', {
      override: { instructions: 'Project rules.' },
    });

    const view = agentsOf(res).find((a) => a.id === 'reviewer');

    expect(res.status).toBe(200);
    expect(view?.tags).toEqual(['builtin', 'overridden']);
    expect(view?.definition.instructions).toBe('Project rules.');
    expect((await storedDoc()).agents).toEqual({
      overrides: { reviewer: { instructions: 'Project rules.' } },
    });
  });

  it('stores a runs_on override and leaves the company agent alone', async () => {
    const res = await override('reviewer', {
      override: {
        runs_on: {
          harness: 'project_default',
          model: { kind: 'harness_default' },
          fallbacks: [],
        },
      },
    });

    expect(res.status).toBe(200);
    expect((await rig.config.history('company')).length).toBe(0);
  });

  it('refuses any other field on a company agent with 400 override_fields', async () => {
    const res = await override('reviewer', {
      override: { instructions: 'x', tools: ['read'] },
    });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('override_fields');
    expect((await rig.config.history('project', 'demo')).length).toBe(0);
  });

  it('refuses a whole agent body for a company agent with 400 override_fields', async () => {
    const res = await override('reviewer', { agent: agentBody() });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('override_fields');
  });

  it('answers 404 for a company agent that does not exist', async () => {
    expect((await override('ghost', { override: { instructions: 'x' } })).status).toBe(
      404,
    );
  });

  it('keeps the role bounds: a runs_on override cannot give a reviewer the Forge default model', async () => {
    const res = await override('reviewer', {
      override: {
        runs_on: {
          harness: 'project_default',
          model: { kind: 'forge_default' },
          fallbacks: [],
        },
      },
    });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('forge_default_not_allowed');
  });

  it('reset-override removes the override and answers 409 not_overridden the second time', async () => {
    await override('reviewer', { override: { instructions: 'Project rules.' } });

    const reset = await call('POST', `${base}/reviewer/reset-override`, at(1));

    expect(agentsOf(reset).find((a) => a.id === 'reviewer')?.tags).toEqual(['builtin']);

    const again = await call('POST', `${base}/reviewer/reset-override`, at(2));

    expect(again.status).toBe(409);
    expect(errorOf(again).code).toBe('not_overridden');
  });
});

/** The project's Full lane without the critic, so the critic is named by nothing and can be switched off (project version 0 to 1). */
const freeTheCritic = () =>
  call('PUT', '/settings/projects/demo/pipelines/full', {
    pipeline: {
      stages: [
        { id: 'implementer', kind: 'agent', label: 'Implement', agent: 'implementer' },
        { id: 'g1', kind: 'script_gate', label: 'G1', run: { builtin: 'g1' } },
        { id: 'merge', kind: 'merge', label: 'Merge', locked: true },
      ],
    },
    ...at(0),
  });

describe('disable, enable and archive of company agents', () => {
  it('switches a company agent off for the project and back on, keeping it listed', async () => {
    await freeTheCritic();
    const off = await call('POST', `${base}/critic/disable`, at(1));

    expect(agentsOf(off).find((a) => a.id === 'critic')?.tags).toEqual([
      'builtin',
      'disabled',
    ]);

    const on = await call('POST', `${base}/critic/enable`, at(2));

    expect(agentsOf(on).find((a) => a.id === 'critic')?.tags).toEqual(['builtin']);
  });

  it('refuses to disable the implementer, which every lane names, with 409 agent_in_pipeline', async () => {
    const res = await call('POST', `${base}/implementer/disable`, at(0));

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('agent_in_pipeline');
  });

  it('refuses to archive a company agent from a project with 409 builtin_locked', async () => {
    const res = await call('POST', `${base}/reviewer/archive`, at(0));

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('builtin_locked');
  });

  it('copies a project agent into the company with the extra project duplicate route', async () => {
    await call('POST', base, { agent: agentBody(), origin: 'custom', ...at(0) });

    const res = await call('POST', `${base}/docs-helper/duplicate`, {
      name: 'Docs helper company',
      scope: 'company',
      ...at(0),
    });

    expect(res.status).toBe(200);
    expect(agentsOf(res).find((a) => a.id === 'docs-helper-company')?.scope).toBe(
      'company',
    );
  });

  it('reads one agent history in the project scope', async () => {
    await freeTheCritic();
    await call('POST', `${base}/critic/disable`, at(1));
    const res = await call('GET', `${base}/critic/history`);

    expect(
      (res.body as { versions: { change: string }[] }).versions.map((v) => v.change),
    ).toEqual(['disabled']);
  });
});
