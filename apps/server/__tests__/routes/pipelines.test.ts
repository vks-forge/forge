/**
 * The company pipeline API: the three lane views, save, reset and the validate door.
 *
 * Why: the pipelines screen trusts the server for what each lane runs today (built-in or edited,
 *   live or waiting), for refusing a list that skips G1 or lets an agent check its own work with
 *   every problem named, for storing a list only when the editor saw the latest version, and for
 *   making Reset the same as "never edited". A refused save must leave the stored history
 *   untouched, or an invalid list could still reach a ticket's snapshot.
 *
 * Pins: GET lists express, standard, full with tags, live and version; PUT stores an edited lane
 *   and answers fresh views; each broken list (merge_missing, g1_missing, rework_target,
 *   self_review, writer_after_check, unknown_agent, group_writer) is 400 pipeline_invalid with
 *   problems and appends nothing; 404 lane_unknown; 409 version_conflict; 400 invalid_request;
 *   a list equal to the shipped one is not stored; reset returns the shipped list and 409
 *   not_overridden when there is nothing to reset; validate writes nothing, lists problems and
 *   warns about a critic on the Worker's model family.
 * Depends on: helpers/agent-rig, helpers/pipeline-fixtures. IO: a loopback socket.
 */

import type { PipelineView } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';
import { INVALID_LISTS, STANDARD_LIKE, send } from '#tests/helpers/pipeline-fixtures.js';

let rig: AgentRig;

const call = (method: string, path: string, body?: unknown) =>
  rig.http.json(method, path, body);

type Reply = { pipelines: Record<string, PipelineView>; version: number };
const replyOf = (r: { body: unknown }): Reply => r.body as Reply;
const errorOf = (r: { body: unknown }) =>
  (r.body as { error: { code: string; problems?: { code: string }[] } }).error;

const versions = async (): Promise<number> =>
  (await rig.config.history('company')).length;

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('GET /settings/pipelines', () => {
  it('lists the three lanes as shipped, with whether each can run', async () => {
    const res = await call('GET', '/settings/pipelines');
    const { pipelines, version } = replyOf(res);

    expect(res.status).toBe(200);
    expect(version).toBe(0);
    expect(Object.keys(pipelines)).toEqual(['express', 'standard', 'full']);
    expect(pipelines['standard']?.tags).toEqual(['builtin']);
    expect(pipelines['standard']?.definition.stages.map((s) => s.id)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'reviewer',
      'merge',
    ]);

    expect(Object.values(pipelines).map((p) => p.live)).toEqual([true, true, false]);
    expect(pipelines['full']?.warnings.length).toBeGreaterThan(0);
  });
});

describe('PUT /settings/pipelines/:lane', () => {
  it('stores an edited lane and answers the fresh views', async () => {
    const before = replyOf(await call('GET', '/settings/pipelines'));
    const res = await call(
      'PUT',
      '/settings/pipelines/standard',
      send(0, { pipeline: STANDARD_LIKE }),
    );

    const after = replyOf(res);

    expect(res.status).toBe(200);
    expect(after.version).toBe(1);
    expect(after.pipelines['standard']?.tags).toEqual(['edited']);
    expect(after.pipelines['standard']?.hash).not.toBe(
      before.pipelines['standard']?.hash,
    );

    expect(after.pipelines['express']?.tags).toEqual(['builtin']);
  });

  it.each(INVALID_LISTS)('refuses a list with $code and stores nothing', async (c) => {
    const res = await call(
      'PUT',
      '/settings/pipelines/standard',
      send(0, { pipeline: { stages: c.stages } }),
    );

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('pipeline_invalid');
    expect(errorOf(res).problems?.map((p) => p.code)).toContain(c.code);
    expect(await versions()).toBe(0);
  });

  it('answers 404 lane_unknown for a lane that does not exist', async () => {
    const res = await call(
      'PUT',
      '/settings/pipelines/turbo',
      send(0, { pipeline: STANDARD_LIKE }),
    );

    expect([res.status, errorOf(res).code]).toEqual([404, 'lane_unknown']);
  });

  it('answers 409 version_conflict when the editor saw an older version', async () => {
    await call(
      'PUT',
      '/settings/pipelines/standard',
      send(0, { pipeline: STANDARD_LIKE }),
    );

    const res = await call(
      'PUT',
      '/settings/pipelines/standard',
      send(0, { pipeline: STANDARD_LIKE }),
    );

    expect([res.status, errorOf(res).code]).toEqual([409, 'version_conflict']);
    expect(await versions()).toBe(1);
  });

  it('answers 400 invalid_request for a body that is not a pipeline', async () => {
    const res = await call(
      'PUT',
      '/settings/pipelines/standard',
      send(0, { pipeline: { stages: [] } }),
    );

    expect([res.status, errorOf(res).code]).toEqual([400, 'invalid_request']);
  });

  it('does not store a list equal to the shipped one', async () => {
    const shipped = replyOf(await call('GET', '/settings/pipelines')).pipelines[
      'standard'
    ];

    await call(
      'PUT',
      '/settings/pipelines/standard',
      send(0, { pipeline: shipped?.definition }),
    );

    const after = replyOf(await call('GET', '/settings/pipelines'));
    const doc = (await rig.config.history('company')).at(-1)?.doc as {
      pipelines?: unknown;
    };

    expect(after.pipelines['standard']?.tags).toEqual(['builtin']);
    expect(doc.pipelines).toBeUndefined();
  });
});

describe('POST /settings/pipelines/:lane/reset', () => {
  it('returns the lane to what the release ships', async () => {
    await call(
      'PUT',
      '/settings/pipelines/standard',
      send(0, { pipeline: STANDARD_LIKE }),
    );

    const res = await call('POST', '/settings/pipelines/standard/reset', send(1));

    expect(res.status).toBe(200);
    expect(replyOf(res).pipelines['standard']?.tags).toEqual(['builtin']);
    expect(replyOf(res).version).toBe(2);
  });

  it('answers 409 not_overridden when the lane was never edited', async () => {
    const res = await call('POST', '/settings/pipelines/standard/reset', send(0));

    expect([res.status, errorOf(res).code]).toEqual([409, 'not_overridden']);
  });
});

describe('POST /settings/pipelines/validate', () => {
  it('lists the problems of a draft and writes nothing', async () => {
    const bad = INVALID_LISTS[0];
    const res = await call('POST', '/settings/pipelines/validate', {
      lane: 'standard',
      pipeline: { stages: bad?.stages },
    });

    const body = res.body as { problems: { code: string }[]; warnings: string[] };

    expect(res.status).toBe(200);
    expect(body.problems.map((p) => p.code)).toContain('merge_missing');
    expect(await versions()).toBe(0);
  });

  it('answers no problems for a good list and warns about a same-family critic', async () => {
    const full = replyOf(await call('GET', '/settings/pipelines')).pipelines['full'];
    const res = await call('POST', '/settings/pipelines/validate', {
      lane: 'full',
      pipeline: full?.definition,
      project: 'demo',
    });

    const body = res.body as { problems: unknown[]; warnings: string[] };

    expect(body.problems).toEqual([]);
    expect(body.warnings.length).toBeGreaterThan(0);
  });

  it('answers 400 invalid_request for an unknown lane and 404 for an unknown project', async () => {
    const lane = await call('POST', '/settings/pipelines/validate', {
      lane: 'turbo',
      pipeline: STANDARD_LIKE,
    });

    const project = await call('POST', '/settings/pipelines/validate', {
      lane: 'standard',
      pipeline: STANDARD_LIKE,
      project: 'ghost',
    });

    expect([lane.status, errorOf(lane).code]).toEqual([400, 'invalid_request']);
    expect([project.status, errorOf(project).code]).toEqual([404, 'project_not_found']);
  });
});
