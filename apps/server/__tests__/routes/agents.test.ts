/**
 * The company agent API: list, create, save, reset, archive and unarchive.
 *
 * Why: agents are the owner's way to say who does a piece of work and on what, and the screens
 *   trust the server for everything that is not typing: which agents exist and why each is
 *   tagged the way it is, that a built-in edit is stored as only its difference and Reset
 *   removes it, that a reviewer that can edit is refused with the rule named, that a save that
 *   raced another is a 409 and nothing is overwritten, and that the implementer cannot be
 *   switched off while every lane needs it. These pin each answer at the HTTP edge.
 *
 * Pins: GET list at version 0; POST create happy path and 400 invalid_request, role_bounds,
 *   unknown_tool, 409 name_taken and version_conflict; PUT built-in stores an override diff and a stale save is a 409.
 * Depends on: helpers/agent-rig. IO: a loopback socket.
 */

import type { CompanyOverride, ConfigVersion } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WHO, agentBody, startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

let rig: AgentRig;

const call = (method: string, path: string, body?: unknown) =>
  rig.http.json(method, path, body);

const at = (expected_version: number, extra: Record<string, unknown> = {}) => ({
  expected_version,
  ...WHO,
  ...extra,
});

const create = (over: Record<string, unknown> = {}, expected = 0) =>
  call('POST', '/settings/agents', {
    agent: agentBody(over),
    origin: 'custom',
    ...at(expected),
  });

/** The agents section of a stored company version. */
const agentsOf = (
  v: ConfigVersion | undefined,
): NonNullable<CompanyOverride['agents']> | undefined =>
  (v?.doc as CompanyOverride | undefined)?.agents;

const errorOf = (res: { body: unknown }): { code: string; issues?: unknown[] } =>
  (res.body as { error: { code: string; issues?: unknown[] } }).error;

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('GET /settings/agents', () => {
  it('lists the four built-ins at version 0 with tags, hashes and readiness', async () => {
    const res = await call('GET', '/settings/agents');
    const body = res.body as {
      agents: {
        id: string;
        tags: string[];
        hash: string;
        readiness: { ready: boolean };
      }[];
      version: number;
    };

    expect(res.status).toBe(200);
    expect(body.version).toBe(0);
    expect(body.agents.map((a) => a.id)).toEqual([
      'implementer',
      'test-writer',
      'reviewer',
      'critic',
    ]);

    expect(body.agents.every((a) => a.tags.join() === 'builtin')).toBe(true);
    expect(body.agents.every((a) => /^[0-9a-f]{64}$/.test(a.hash))).toBe(true);
    expect(body.agents[0]?.readiness.ready).toBe(true);
  });
});

describe('POST /settings/agents', () => {
  it('creates a custom agent and answers with its id and the fresh list', async () => {
    const res = await create();
    const body = res.body as {
      id: string;
      version: number;
      agents: { id: string; tags: string[] }[];
    };

    expect(res.status).toBe(200);
    expect(body.id).toBe('docs-helper');
    expect(body.version).toBe(1);
    expect(body.agents.find((a) => a.id === 'docs-helper')?.tags).toEqual(['company']);
  });

  it('stores the agent whole with its origin and writes one attributed version', async () => {
    await create();

    const [v1] = await rig.config.history('company');

    expect(v1).toMatchObject({ version: 1, author: 'owner', reason: WHO.reason });
    expect(agentsOf(v1)?.['docs-helper']).toMatchObject({
      name: 'Docs helper',
      origin: 'custom',
      archived: false,
    });
  });

  it('refuses a malformed body with 400 invalid_request', async () => {
    const res = await call('POST', '/settings/agents', {
      agent: { name: 'x' },
      origin: 'custom',
      ...at(0),
    });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('invalid_request');
  });

  it('refuses a reviewer that can edit with 400 role_bounds and lists the rule', async () => {
    const res = await create({
      role: 'reviewer',
      tools: ['read', 'edit'],
      write_scope: [],
    });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('role_bounds');
    expect(JSON.stringify(errorOf(res).issues)).toContain('edit');
  });

  it('refuses a tool that is not in the catalogue with 400 unknown_tool', async () => {
    const res = await create({ tools: ['read', 'teleport'] });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('unknown_tool');
  });

  it('refuses the Forge default model on any agent but the implementer', async () => {
    const res = await create({
      runs_on: {
        harness: 'project_default',
        model: { kind: 'forge_default' },
        fallbacks: [],
      },
    });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('forge_default_not_allowed');
  });

  it('answers 409 name_taken for a name a built-in already uses', async () => {
    const res = await create({
      name: 'Reviewer',
      role: 'reviewer',
      tools: ['read'],
      write_scope: [],
    });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('name_taken');
  });

  it('answers 409 version_conflict when the editor saw an older version and changes nothing', async () => {
    await create();
    const res = await create({ name: 'Another' }, 0);

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('version_conflict');
    expect((await rig.config.history('company')).length).toBe(1);
  });
});

describe('PUT /settings/agents/:id', () => {
  const edit = (id: string, over: Record<string, unknown>, expected: number) =>
    call('PUT', `/settings/agents/${id}`, {
      agent: agentBody({
        name: 'Reviewer',
        role: 'reviewer',
        tools: ['read'],
        write_scope: [],
        runs_on: {
          harness: 'project_default',
          model: { kind: 'model', id: 'opus' },
          fallbacks: [],
        },
        ...over,
      }),
      ...at(expected),
    });

  it('stores an edited built-in as only the difference from what the release ships', async () => {
    const res = await edit(
      'reviewer',
      { instructions: 'Be terse.', description: 'Reviews.' },
      0,
    );

    const [v1] = await rig.config.history('company');

    expect(res.status).toBe(200);
    expect(Object.keys(agentsOf(v1)?.['reviewer'] ?? {}).sort()).toEqual([
      'description',
      'inputs',
      'instructions',
      'output',
      'tools',
    ]);

    const listed = (
      res.body as {
        agents: { id: string; tags: string[]; definition: { instructions: string } }[];
      }
    ).agents;

    const reviewer = listed.find((a) => a.id === 'reviewer');

    expect(reviewer?.tags).toEqual(['builtin', 'overridden']);
    expect(reviewer?.definition.instructions).toBe('Be terse.');
  });

  it('answers 409 version_conflict on a second save with a stale version', async () => {
    await edit('reviewer', { instructions: 'First.' }, 0);
    const stale = await edit('reviewer', { instructions: 'Second.' }, 0);

    expect(stale.status).toBe(409);
    expect(errorOf(stale).code).toBe('version_conflict');
  });

  it('answers 404 agent_not_found for an id nobody has', async () => {
    const res = await edit('ghost', {}, 0);

    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('agent_not_found');
  });

  it('keeps the role bounds on a save', async () => {
    const res = await edit('reviewer', { tools: ['read', 'shell'] }, 0);

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('role_bounds');
  });
});
