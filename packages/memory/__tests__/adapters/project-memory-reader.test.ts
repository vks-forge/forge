/**
 * Project memory index and reader tests — what the owner and the API see after writes.
 *
 * Why: the owner reads `MEMORY.md` and the memory API first, so the index must be rebuilt
 *   and committed together with every record change, and the reader must show pending
 *   proposals before decisions before rejected approaches, give one record with its body,
 *   and treat unknown ids and path-like ids as simply not found.
 *
 * Pins: MEMORY.md content after propose and approve, clean working tree, reader list order,
 *   reader get with body, unknown and malicious ids.
 * Depends on: adapters/git-project-memory, @forge/core, vitest, git on PATH.
 *   IO: temp folder.
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectMemory } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProjectMemory } from '#/adapters/git-project-memory/create-project-memory.js';

let root: string;
let memory: ProjectMemory;
let clockMs: number;

const status = (slug: string): string =>
  execFileSync('git', ['status', '--porcelain'], {
    cwd: join(root, slug),
    encoding: 'utf8',
  }).trim();

const source = { type: 'chat', ref: 'the owner said so' } as const;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-pmem-read-'));
  clockMs = Date.parse('2026-10-15T10:00:00.000Z');
  memory = createProjectMemory({ rootDir: root, now: () => new Date((clockMs += 1000)) });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('index', () => {
  it('rebuilds MEMORY.md on every write and commits it with the record', async () => {
    const { id } = await memory.writer.propose('shop', { statement: 'Use zod', source });
    expect(await readFile(join(root, 'shop', 'MEMORY.md'), 'utf8')).toContain(
      '## Pending proposals\n- [x-0001](proposed/x-0001-use-zod.md): Use zod',
    );

    await memory.writer.approve('shop', id, 'u');
    const index = await readFile(join(root, 'shop', 'MEMORY.md'), 'utf8');

    expect(index).toContain(
      '## Decisions\n- [x-0001](decisions/x-0001-use-zod.md): Use zod',
    );

    expect(index).not.toContain('Pending proposals');
    expect(status('shop')).toBe('');
  });
});

describe('reader', () => {
  it('lists proposals, then decisions, then rejected, and fetches one record with its body', async () => {
    await memory.writer.decide('shop', { statement: 'D one', source, body: 'Details.' });
    const p = await memory.writer.propose('shop', { statement: 'P one', source });
    const q = await memory.writer.propose('shop', { statement: 'P two', source });
    await memory.writer.reject('shop', q.id, 'no', 'u');

    const list = await memory.reader.list('shop');

    expect(list.map((e) => [e.id, e.kind, e.status])).toEqual([
      [p.id, 'proposal', 'pending'],
      ['d-0001', 'decision', 'active'],
      [q.id, 'rejected', 'rejected'],
    ]);

    expect(await memory.reader.get('shop', 'd-0001')).toMatchObject({
      id: 'd-0001',
      statement: 'D one',
      body: 'Details.',
    });

    expect(await memory.reader.get('shop', 'd-0042')).toBeNull();
    expect(await memory.reader.get('shop', '../x')).toBeNull();
  });
});
