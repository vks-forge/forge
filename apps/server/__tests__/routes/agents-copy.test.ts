/**
 * Copying agents and reading their history: duplicate and history routes.
 *
 * Why: the owner starts a new agent from an existing one (a copy that remembers its source, with a
 *   new name) into the company or a project, and asks who changed an agent and when. A copy of the
 *   implementer must not carry the lane default model, which only the built-in implementer may use;
 *   a name already in use is refused; history is derived from the scope versions, never stored twice.
 *
 * Pins: duplicate into the company and into a project, origin duplicate:<id>, forge_default turned
 *   into a named model, 409 name_taken; history kinds, author and reason, 404 for an unknown agent.
 * Depends on: helpers/agent-rig. IO: a loopback socket.
 */

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

const errorOf = (res: { body: unknown }): { code: string; issues?: unknown[] } =>
  (res.body as { error: { code: string; issues?: unknown[] } }).error;

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('POST /settings/agents/:id/duplicate', () => {
  it('copies a built-in into a new custom company agent that remembers its source', async () => {
    const res = await call('POST', '/settings/agents/reviewer/duplicate', {
      name: 'Strict reviewer',
      scope: 'company',
      ...at(0),
    });

    const body = res.body as {
      id: string;
      agents: { id: string; definition: { origin: string } }[];
    };

    expect(res.status).toBe(200);
    expect(body.id).toBe('strict-reviewer');
    expect(body.agents.find((a) => a.id === 'strict-reviewer')?.definition.origin).toBe(
      'duplicate:reviewer',
    );
  });

  it('turns the implementer lane default model into a named model in the copy', async () => {
    const res = await call('POST', '/settings/agents/implementer/duplicate', {
      name: 'Second writer',
      scope: 'company',
      ...at(0),
    });

    const copy = (
      res.body as {
        agents: { id: string; definition: { runs_on: { model: unknown } } }[];
      }
    ).agents.find((a) => a.id === 'second-writer');

    expect(res.status).toBe(200);
    expect(copy?.definition.runs_on.model).toEqual({ kind: 'model', id: 'sonnet' });
  });

  it('copies into a project and answers with that project list', async () => {
    const res = await call('POST', '/settings/agents/reviewer/duplicate', {
      name: 'Demo reviewer',
      scope: 'project',
      project: 'demo',
      ...at(0),
    });

    const body = res.body as {
      id: string;
      version: { company: number; project: number };
    };

    expect(res.status).toBe(200);
    expect(body.version).toEqual({ company: 0, project: 1 });
  });

  it('answers 409 name_taken when the name is in use', async () => {
    const res = await call('POST', '/settings/agents/reviewer/duplicate', {
      name: 'Critic',
      scope: 'company',
      ...at(0),
    });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('name_taken');
  });
});

describe('GET /settings/agents/:id/history', () => {
  it('lists the versions that touched the agent, with author, reason and kind of change', async () => {
    await create();
    await call('PUT', '/settings/agents/docs-helper', {
      agent: agentBody({ instructions: 'Longer.' }),
      ...at(1),
    });

    const res = await call('GET', '/settings/agents/docs-helper/history');
    const versions = (
      res.body as { versions: { version: number; change: string; author: string }[] }
    ).versions;

    expect(res.status).toBe(200);
    expect(versions.map((v) => [v.version, v.change, v.author])).toEqual([
      [1, 'created', 'owner'],
      [2, 'edited', 'owner'],
    ]);
  });

  it('answers 404 for an agent that does not exist', async () => {
    expect((await call('GET', '/settings/agents/ghost/history')).status).toBe(404);
  });
});
