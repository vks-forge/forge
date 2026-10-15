/**
 * Memory API tests — the owner answers the Director's proposals over HTTP.
 *
 * Why: a Director inference may shape later planning only after the owner approves it, so
 *   the approve and reject endpoints are the gate. They must change the real memory
 *   repository (one commit naming who answered), refuse to answer twice, refuse unknown
 *   records and projects, and offer no way to write a decision directly: owner decisions
 *   come through the Director, not through this API.
 *
 * Pins: GET list and one record, approve and reject (200, record state, commit sha), 400 on
 *   bad bodies, 404 for unknown project or record, 409 on a second answer, 405 on creating a
 *   record, and that the engine's read slice sees an approved record.
 * Depends on: helpers/projects-rig, @forge/memory, node:child_process. IO: a loopback socket,
 *   in-memory storage, a temp memory folder with real git repositories.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Project } from '@forge/core';
import { createFileMemorySource, createProjectMemory } from '@forge/memory';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startProjectsRig } from '#tests/helpers/projects-rig.js';
import type { ProjectsRig } from '#tests/helpers/projects-rig.js';

let memoryRoot: string;
let rigs: ProjectsRig;
let memory: ReturnType<typeof createProjectMemory>;

const source = { type: 'chat', ref: 'inferred from package.json' } as const;
const head = (slug: string): string =>
  execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: join(memoryRoot, slug),
    encoding: 'utf8',
  }).trim();

const row = (slug: string): Project => ({
  id: slug,
  slug,
  prefix: slug.slice(0, 2).toUpperCase(),
  status: 'ready',
  ecosystems: [],
  harness_defaults: {},
  tier_c_globs: [],
});

beforeEach(async () => {
  memoryRoot = mkdtempSync(join(tmpdir(), 'forge-memapi-'));
  memory = createProjectMemory({ rootDir: memoryRoot, now: () => new Date() });
  rigs = await startProjectsRig(join(memoryRoot, 'unused'), memory);
  await rigs.storage.transaction((tx) => tx.projects.upsert(row('shop')));
});

afterEach(async () => {
  await rigs.rig.close();
  rmSync(memoryRoot, { recursive: true, force: true });
});

describe('GET /projects/:slug/memory', () => {
  it('is empty for a project with no memory yet', async () => {
    const res = await rigs.rig.json('GET', '/projects/shop/memory');

    expect(res).toMatchObject({ status: 200, body: { records: [] } });
  });

  it('lists records with id, kind, status, statement and tags only', async () => {
    await memory.writer.propose('shop', {
      statement: 'Use pnpm',
      source,
      tags: ['tooling'],
      body: 'long body',
    });

    const res = await rigs.rig.json('GET', '/projects/shop/memory');

    expect(res.body).toEqual({
      records: [
        {
          id: 'x-0001',
          kind: 'proposal',
          status: 'pending',
          statement: 'Use pnpm',
          tags: ['tooling'],
        },
      ],
    });
  });

  it('answers 404 for a project that is not registered', async () => {
    const res = await rigs.rig.json('GET', '/projects/ghost/memory');

    expect(res).toMatchObject({
      status: 404,
      body: { error: { code: 'project_not_found' } },
    });
  });
});

describe('GET /projects/:slug/memory/:id', () => {
  it('returns the full record with its body, and 404 for an unknown id', async () => {
    await memory.writer.propose('shop', {
      statement: 'Use pnpm',
      source,
      body: 'Why: lockfile.',
    });

    const found = await rigs.rig.json('GET', '/projects/shop/memory/x-0001');
    const missing = await rigs.rig.json('GET', '/projects/shop/memory/x-0042');

    expect(found).toMatchObject({
      status: 200,
      body: {
        record: {
          id: 'x-0001',
          author: 'director',
          origin: 'agent',
          source,
          body: 'Why: lockfile.',
        },
      },
    });

    expect(missing).toMatchObject({
      status: 404,
      body: { error: { code: 'memory_record_not_found' } },
    });
  });
});

describe('approving and rejecting proposals', () => {
  it('approve turns the proposal into an active decision, commits it, and the engine slice sees it', async () => {
    await memory.writer.propose('shop', { statement: 'Use pnpm', source });

    const res = await rigs.rig.json(
      'POST',
      '/projects/shop/memory/proposals/x-0001/approve',
      {
        author: 'vikash',
      },
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      commit: head('shop'),
      record: { id: 'x-0001', kind: 'decision', status: 'active', approved_by: 'vikash' },
    });

    expect(await createFileMemorySource(memoryRoot).slice('shop')).toEqual({
      decisions: [{ id: 'x-0001', statement: 'Use pnpm' }],
      rejected: [],
    });
  });

  it('reject records the reason and the approach lands in the rejected slice', async () => {
    await memory.writer.propose('shop', { statement: 'Adopt mongo', source });

    const res = await rigs.rig.json(
      'POST',
      '/projects/shop/memory/proposals/x-0001/reject',
      {
        author: 'vikash',
        reason: 'we are on SQLite',
      },
    );

    expect(res.body).toMatchObject({
      record: {
        kind: 'rejected',
        status: 'rejected',
        rejected_reason: 'we are on SQLite',
      },
    });

    expect((await createFileMemorySource(memoryRoot).slice('shop')).rejected).toEqual([
      { id: 'x-0001', statement: 'Adopt mongo' },
    ]);
  });

  it('a second answer is a 409 and changes nothing', async () => {
    await memory.writer.propose('shop', { statement: 'Use pnpm', source });
    await rigs.rig.json('POST', '/projects/shop/memory/proposals/x-0001/approve', {
      author: 'vikash',
    });

    const before = head('shop');
    const again = await rigs.rig.json(
      'POST',
      '/projects/shop/memory/proposals/x-0001/reject',
      {
        author: 'other',
        reason: 'changed my mind',
      },
    );

    expect(again).toMatchObject({
      status: 409,
      body: { error: { code: 'not_a_pending_proposal' } },
    });

    expect(head('shop')).toBe(before);
  });

  it.each([
    ['approve', { author: 'vikash' }],
    ['reject', { author: 'vikash', reason: 'no' }],
  ])('%s of an unknown id is a 404', async (action, body) => {
    const res = await rigs.rig.json(
      'POST',
      `/projects/shop/memory/proposals/x-0099/${action}`,
      body,
    );

    expect(res).toMatchObject({
      status: 404,
      body: { error: { code: 'memory_record_not_found' } },
    });
  });

  it.each([
    ['approve without an author', 'approve', {}],
    ['reject without a reason', 'reject', { author: 'vikash' }],
    ['reject with a blank reason', 'reject', { author: 'vikash', reason: '  ' }],
    ['approve with an extra field', 'approve', { author: 'vikash', status: 'active' }],
  ])('%s is a 400', async (_name, action, body) => {
    await memory.writer.propose('shop', { statement: 'Use pnpm', source });

    const res = await rigs.rig.json(
      'POST',
      `/projects/shop/memory/proposals/x-0001/${action}`,
      body,
    );

    expect(res.status).toBe(400);
  });

  it('answers 404 for an unregistered project', async () => {
    const res = await rigs.rig.json(
      'POST',
      '/projects/ghost/memory/proposals/x-0001/approve',
      {
        author: 'vikash',
      },
    );

    expect(res).toMatchObject({
      status: 404,
      body: { error: { code: 'project_not_found' } },
    });
  });
});

describe('what the API does not offer', () => {
  it('has no way to create a decision or a proposal', async () => {
    const res = await rigs.rig.json('POST', '/projects/shop/memory', {
      statement: 'Sneaky decision',
      source,
    });

    expect(res.status).toBe(405);
    expect(await memory.reader.list('shop')).toEqual([]);
  });
});
