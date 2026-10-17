/**
 * The project pipeline API: a project's lane views, its own lists, reset and routing rules.
 *
 * Why: a project may replace a lane's pipeline and add routing rules that put a check on work
 *   touching certain paths. The screen relies on the server for `changed` (is this lane the
 *   project's own), for refusing the same unsafe lists the company door refuses, for refusing
 *   routing rules that add a writer or an unknown agent, and for the lock that stops an agent
 *   named by a pipeline or rule from being switched off or archived (409 agent_in_pipeline, with
 *   the lanes and rules that name it), which would strand every ticket of that lane.
 *
 * Pins: GET with both version counters, `changed` and 404 project_not_found; PUT stores the
 *   project's own list (tag project, changed) and refuses a broken one with nothing stored; reset
 *   removes it and 409 not_overridden; routing save and read-back, 400 routing_invalid for a
 *   writer, an unknown agent and a repeated id; 409 version_conflict; disabling the reviewer
 *   while Standard names it, disabling the critic named by a routing rule, and archiving a custom
 *   company reviewer that a project pipeline names, are 409 agent_in_pipeline with lanes and rules.
 * Depends on: helpers/agent-rig, helpers/pipeline-fixtures. IO: a loopback socket.
 */

import type { PipelineView } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentBody, startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';
import {
  INVALID_LISTS,
  STANDARD_LIKE,
  agent,
  send,
} from '#tests/helpers/pipeline-fixtures.js';

let rig: AgentRig;

const base = '/settings/projects/demo';
const call = (method: string, path: string, body?: unknown) =>
  rig.http.json(method, path, body);

type LaneView = PipelineView & { changed: boolean };
type Reply = {
  pipelines: Record<string, LaneView>;
  routing: { id: string }[];
  version: { company: number; project: number };
};

const replyOf = (r: { body: unknown }): Reply => r.body as Reply;
const errorOf = (r: { body: unknown }) =>
  (
    r.body as {
      error: {
        code: string;
        problems?: { code: string }[];
        lanes?: string[];
        rules?: string[];
      };
    }
  ).error;

const versions = async (): Promise<number> =>
  (await rig.config.history('project', 'demo')).length;

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('GET /settings/projects/:slug/pipelines', () => {
  it('lists the lanes as the company runs them, unchanged, with both version counters', async () => {
    const res = await call('GET', `${base}/pipelines`);
    const body = replyOf(res);

    expect(res.status).toBe(200);
    expect(body.version).toEqual({ company: 0, project: 0 });
    expect(body.routing).toEqual([]);
    expect(Object.values(body.pipelines).map((p) => p.changed)).toEqual([
      false,
      false,
      false,
    ]);

    expect(body.pipelines['standard']?.tags).toEqual(['builtin', 'company']);
  });

  it('answers 404 project_not_found for an unknown project', async () => {
    const res = await call('GET', '/settings/projects/ghost/pipelines');

    expect([res.status, errorOf(res).code]).toEqual([404, 'project_not_found']);
  });
});

describe('PUT and reset of a project lane', () => {
  const put = (expected = 0, pipeline: unknown = STANDARD_LIKE) =>
    call('PUT', `${base}/pipelines/standard`, send(expected, { pipeline }));

  it('stores the project own list and marks the lane changed', async () => {
    const res = await put();
    const body = replyOf(res);

    expect(res.status).toBe(200);
    expect(body.version.project).toBe(1);
    expect(body.pipelines['standard']?.changed).toBe(true);
    expect(body.pipelines['standard']?.tags).toEqual(['edited', 'project']);
    expect(body.pipelines['express']?.changed).toBe(false);
  });

  it.each(INVALID_LISTS.slice(0, 3))('refuses $code and stores nothing', async (c) => {
    const res = await put(0, { stages: c.stages });

    expect([res.status, errorOf(res).code]).toEqual([400, 'pipeline_invalid']);
    expect(errorOf(res).problems?.map((p) => p.code)).toContain(c.code);
    expect(await versions()).toBe(0);
  });

  it('does not store a list equal to the company one', async () => {
    const company = replyOf(await call('GET', `${base}/pipelines`)).pipelines['standard'];
    const res = await put(0, company?.definition);

    expect(replyOf(res).pipelines['standard']?.changed).toBe(false);
  });

  it('resets to the company list, and 409 not_overridden when there is no override', async () => {
    await put();
    const back = await call('POST', `${base}/pipelines/standard/reset`, send(1));
    const again = await call('POST', `${base}/pipelines/standard/reset`, send(2));

    expect(replyOf(back).pipelines['standard']?.changed).toBe(false);
    expect([again.status, errorOf(again).code]).toEqual([409, 'not_overridden']);
  });

  it('answers 404 lane_unknown and 409 version_conflict', async () => {
    const lane = await call(
      'PUT',
      `${base}/pipelines/turbo`,
      send(0, { pipeline: STANDARD_LIKE }),
    );

    await put();
    const stale = await put(0);

    expect([lane.status, errorOf(lane).code]).toEqual([404, 'lane_unknown']);
    expect([stale.status, errorOf(stale).code]).toEqual([409, 'version_conflict']);
  });
});

describe('PUT /settings/projects/:slug/routing', () => {
  const rule = (id: string, add: string) => ({ id, paths: ['**/*.tf'], add });
  const save = (rules: unknown[], expected = 0) =>
    call('PUT', `${base}/routing`, send(expected, { rules }));

  it('stores the rules and reads them back', async () => {
    const res = await save([rule('net', 'reviewer')]);
    const read = await call('GET', `${base}/pipelines`);

    expect(res.status).toBe(200);
    expect(replyOf(res).routing.map((r) => r.id)).toEqual(['net']);
    expect(replyOf(read).routing.map((r) => r.id)).toEqual(['net']);
    expect(replyOf(res).version.project).toBe(1);
  });

  it.each([
    ['a writer agent', [rule('w', 'implementer')], 'routing_writer'],
    ['an unknown agent', [rule('x', 'ghost-agent')], 'unknown_agent'],
    ['a repeated id', [rule('a', 'reviewer'), rule('a', 'critic')], 'duplicate_rule_id'],
  ])('refuses %s with routing_invalid and stores nothing', async (_n, rules, code) => {
    const res = await save(rules);

    expect([res.status, errorOf(res).code]).toEqual([400, 'routing_invalid']);
    expect(errorOf(res).problems?.map((p) => p.code)).toContain(code);
    expect(await versions()).toBe(0);
  });

  it('answers 409 version_conflict for a stale editor', async () => {
    await save([rule('net', 'reviewer')]);
    const res = await save([], 0);

    expect([res.status, errorOf(res).code]).toEqual([409, 'version_conflict']);
  });
});

describe('agents named by a pipeline or rule cannot be switched off', () => {
  const act = (path: string, expected: number) => call('POST', path, send(expected));

  it('refuses to disable the reviewer while Standard names it', async () => {
    const res = await act(`${base}/agents/reviewer/disable`, 0);

    expect([res.status, errorOf(res).code]).toEqual([409, 'agent_in_pipeline']);
    expect(errorOf(res).lanes).toEqual(['standard', 'full']);
    expect(errorOf(res).rules).toEqual([]);
  });

  it('names the routing rule that adds the critic', async () => {
    await call(
      'PUT',
      `${base}/routing`,
      send(0, {
        rules: [{ id: 'net', paths: ['**/*.tf'], add: 'critic' }],
      }),
    );

    const res = await act(`${base}/agents/critic/disable`, 1);

    expect(errorOf(res).lanes).toEqual(['full']);
    expect(errorOf(res).rules).toEqual(['net']);
  });

  it('lets a project disable an agent no pipeline names', async () => {
    await call('PUT', `${base}/pipelines/full`, send(0, { pipeline: STANDARD_LIKE }));
    await call('PUT', `${base}/pipelines/standard`, send(1, { pipeline: STANDARD_LIKE }));
    const res = await act(`${base}/agents/critic/disable`, 2);

    expect(res.status).toBe(200);
  });

  it('refuses to archive a custom company reviewer a project pipeline names', async () => {
    const created = await call('POST', '/settings/agents', {
      agent: agentBody({
        name: 'Net reviewer',
        role: 'reviewer',
        tools: ['read', 'mcp__forge__submit_review'],
        write_scope: [],
      }),
      origin: 'custom',
      expected_version: 0,
      reason: 'a network reviewer',
    });

    const id = (created.body as { id: string }).id;
    await call(
      'PUT',
      `${base}/pipelines/standard`,
      send(0, {
        pipeline: {
          stages: [
            ...STANDARD_LIKE.stages.slice(0, 2),
            agent('net', id),
            STANDARD_LIKE.stages[3],
          ],
        },
      }),
    );

    const res = await call('POST', `/settings/agents/${id}/archive`, send(1));

    expect([res.status, errorOf(res).code]).toEqual([409, 'agent_in_pipeline']);
    expect(errorOf(res).lanes).toEqual(['standard']);
  });
});
