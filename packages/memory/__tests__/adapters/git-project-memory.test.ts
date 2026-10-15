/**
 * Git-backed project memory tests — the Director's writer and reader against a real repository.
 *
 * Why: a project's memory is only trustworthy if every change is one attributable commit,
 *   ids never repeat, a state move keeps the owner's words intact, concurrent writes do not
 *   interleave, and the engine's read slice sees exactly the approved records. These tests
 *   drive real `git` in a temp folder, because the commit is the product here.
 *
 * Pins: one commit per write by "Forge Director", propose/decide/approve/
 *   reject/supersede/appendOutcome semantics, sequential ids, serialised
 *   concurrent writes, slug and state errors, slice compatibility.
 * Depends on: adapters/git-project-memory, adapters/file-memory-source, @forge/core, vitest,
 *   git on PATH. IO: temp folder.
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  InvalidInputError,
  MemoryRecordNotFoundError,
  MemoryRecordStateError,
} from '@forge/core';
import type { ProjectMemory } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileMemorySource } from '#/adapters/file-memory-source.js';
import { createProjectMemory } from '#/adapters/git-project-memory/create-project-memory.js';
import { parseRecordFile } from '#/domain/record-file.js';

let root: string;
let memory: ProjectMemory;
let clockMs: number;
const skipped: string[] = [];

const git = (slug: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: join(root, slug), encoding: 'utf8' }).trim();

const source = { type: 'chat', ref: 'the owner said so' } as const;

async function readRecordFile(
  slug: string,
  folder: string,
): Promise<ReturnType<typeof parseRecordFile>> {
  const name =
    (await readdir(join(root, slug, folder))).find((n) => n.endsWith('.md')) ?? '';

  return parseRecordFile(await readFile(join(root, slug, folder, name), 'utf8'));
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-pmem-'));
  clockMs = Date.parse('2026-10-15T10:00:00.000Z');
  skipped.length = 0;
  memory = createProjectMemory({
    rootDir: root,
    now: () => new Date((clockMs += 1000)),
    onSkip: (path, reason) => skipped.push(`${path}: ${reason}`),
  });
});

afterEach(async () => {
  expect(skipped).toEqual([]);
  await rm(root, { recursive: true, force: true });
});

describe('writer', () => {
  it('propose writes a pending proposal by the director in one commit that names the record', async () => {
    const { id, commit } = await memory.writer.propose('shop', {
      statement: 'Prefer vitest over jest',
      source,
      confidence: 0.6,
      tags: ['tests'],
      body: 'Seen in package.json.',
    });

    expect(id).toBe('x-0001');
    expect(git('shop', 'rev-parse', 'HEAD')).toBe(commit);
    expect(git('shop', 'log', '-1', '--format=%an|%s')).toBe(
      'Forge Director|memory: propose x-0001: Prefer vitest over jest',
    );

    const file = await readRecordFile('shop', 'proposed');
    expect(file.ok && file.record).toMatchObject({
      id: 'x-0001',
      kind: 'proposal',
      status: 'pending',
      author: 'director',
      origin: 'agent',
      confidence: 0.6,
      tags: ['tests'],
    });

    expect(file.ok && file.body).toBe('Seen in package.json.');
    expect(git('shop', 'status', '--porcelain')).toBe('');
  });

  it('refuses a proposal more confident than the director may be', async () => {
    await expect(
      memory.writer.propose('shop', { statement: 'x', source, confidence: 0.95 }),
    ).rejects.toThrow();
  });

  it('decide writes an active decision authored by the user, pinned by default', async () => {
    const { id } = await memory.writer.decide('shop', {
      statement: 'Ship on Fridays',
      source,
    });

    expect(id).toBe('d-0001');
    const file = await readRecordFile('shop', 'decisions');
    expect(file.ok && file.record).toMatchObject({
      kind: 'decision',
      status: 'active',
      author: 'user',
      origin: 'owner',
      pinned: true,
    });
  });

  it('approve moves the proposal to decisions keeping id and words, and the engine slice sees it', async () => {
    const slice = createFileMemorySource(root);
    const { id } = await memory.writer.propose('shop', { statement: 'Use zod', source });
    expect((await slice.slice('shop')).decisions).toEqual([]);

    await memory.writer.approve('shop', id, 'vikash');

    expect(await readdir(join(root, 'shop', 'proposed'))).toEqual([]);
    const file = await readRecordFile('shop', 'decisions');
    expect(file.ok && file.record).toMatchObject({
      id: 'x-0001',
      kind: 'decision',
      status: 'active',
      statement: 'Use zod',
      author: 'director',
      origin: 'agent',
      approved_by: 'vikash',
      approved_at: '2026-10-15T10:00:02.000Z',
    });

    expect((await slice.slice('shop')).decisions).toEqual([
      { id: 'x-0001', statement: 'Use zod' },
    ]);

    expect(git('shop', 'log', '-1', '--format=%s')).toBe(
      'memory: approve x-0001 (by vikash)',
    );

    expect(git('shop', 'rev-list', '--count', 'HEAD')).toBe('3');
  });

  it('reject moves the proposal to rejected with the reason and the engine slice lists it', async () => {
    const { id } = await memory.writer.propose('shop', {
      statement: 'Adopt mongo',
      source,
    });

    await memory.writer.reject('shop', id, 'we are on SQLite', 'vikash');

    const file = await readRecordFile('shop', 'rejected');
    expect(file.ok && file.record).toMatchObject({
      id: 'x-0001',
      kind: 'rejected',
      status: 'rejected',
      rejected_reason: 'we are on SQLite',
      rejected_by: 'vikash',
    });

    expect((await createFileMemorySource(root).slice('shop')).rejected).toEqual([
      { id: 'x-0001', statement: 'Adopt mongo' },
    ]);
  });

  it('answering a proposal twice, or a missing one, fails and commits nothing', async () => {
    const { id } = await memory.writer.propose('shop', { statement: 'A', source });
    await memory.writer.approve('shop', id, 'vikash');
    const head = git('shop', 'rev-parse', 'HEAD');

    await expect(memory.writer.reject('shop', id, 'late', 'vikash')).rejects.toThrow(
      MemoryRecordStateError,
    );

    await expect(memory.writer.approve('shop', 'x-0099', 'vikash')).rejects.toThrow(
      MemoryRecordNotFoundError,
    );

    await expect(memory.writer.reject('shop', id, '  ', 'vikash')).rejects.toThrow(
      InvalidInputError,
    );

    expect(git('shop', 'rev-parse', 'HEAD')).toBe(head);
  });

  it('supersede writes a new decision and retires the old one without editing its words', async () => {
    const { id: oldId } = await memory.writer.decide('shop', {
      statement: 'Use REST: simple',
      source,
      tags: ['api'],
    });

    const before = await readRecordFile('shop', 'decisions');
    const { id: newId } = await memory.writer.supersede('shop', oldId, {
      statement: 'Use GraphQL',
      source: { type: 'chat', ref: 'changed our mind' },
    });

    expect(newId).toBe('d-0002');
    const files = await readdir(join(root, 'shop', 'decisions'));
    expect(files).toHaveLength(2);

    const old = await readRecordFile('shop', 'decisions');
    expect(before.ok && old.ok && old.record).toMatchObject({
      statement: before.ok ? before.record.statement : '',
      source: before.ok ? before.record.source : {},
      author: 'user',
      origin: 'owner',
      status: 'superseded',
      superseded_by: 'd-0002',
    });

    const slice = await createFileMemorySource(root).slice('shop');
    expect(slice.decisions).toEqual([{ id: 'd-0002', statement: 'Use GraphQL' }]);
    expect(git('shop', 'rev-list', '--count', 'HEAD')).toBe('3');
    expect(git('shop', 'show', 'HEAD', '--stat', '--format=')).toContain('MEMORY.md');
  });

  it('cannot supersede a record that is not an active decision', async () => {
    const { id } = await memory.writer.propose('shop', { statement: 'A', source });

    await expect(
      memory.writer.supersede('shop', id, { statement: 'B', source }),
    ).rejects.toThrow(MemoryRecordStateError);
  });

  it('appendOutcome files the text under outcomes/YYYY-MM and keeps it out of the reader list and the slice', async () => {
    const { id } = await memory.writer.appendOutcome(
      'shop',
      'Shipped login.\n\nPending: logout.',
    );

    expect(id).toBe('o-0001');
    const month = await readdir(join(root, 'shop', 'outcomes'));
    expect(month).toEqual(['2026-10']);
    expect(await memory.reader.list('shop')).toEqual([]);
    expect(await createFileMemorySource(root).slice('shop')).toEqual({
      decisions: [],
      rejected: [],
    });

    expect((await memory.reader.get('shop', 'o-0001'))?.body).toBe(
      'Shipped login.\n\nPending: logout.',
    );

    await expect(memory.writer.appendOutcome('shop', '  ')).rejects.toThrow(
      InvalidInputError,
    );
  });

  it('never reuses an id after a proposal leaves proposed/', async () => {
    const a = await memory.writer.propose('shop', { statement: 'A', source });
    await memory.writer.approve('shop', a.id, 'u');
    const b = await memory.writer.propose('shop', { statement: 'B', source });

    expect([a.id, b.id]).toEqual(['x-0001', 'x-0002']);
  });

  it('serialises concurrent writes: unique ids, one commit each, clean tree', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        memory.writer.propose('shop', { statement: `Idea number ${i}`, source }),
      ),
    );

    expect(new Set(results.map((r) => r.id)).size).toBe(8);
    expect(new Set(results.map((r) => r.commit)).size).toBe(8);
    expect(git('shop', 'rev-list', '--count', 'HEAD')).toBe('9');
    expect(git('shop', 'status', '--porcelain')).toBe('');
    expect(await readdir(join(root, 'shop', 'proposed'))).toHaveLength(8);
  });

  it('keeps projects apart', async () => {
    await memory.writer.decide('alpha', { statement: 'Alpha rule', source });
    await memory.writer.decide('beta', { statement: 'Beta rule', source });

    expect((await memory.reader.list('alpha')).map((e) => e.statement)).toEqual([
      'Alpha rule',
    ]);

    expect((await memory.reader.list('beta')).map((e) => e.statement)).toEqual([
      'Beta rule',
    ]);
  });
});
