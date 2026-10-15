/**
 * Project memory repository tests — creating the private repo, lazily and safely.
 *
 * Why: every project needs a private git repository for its memory from its first ticket,
 *   including projects registered before memory moved into the data home. It must be created
 *   once, never by a read, and a slug that tries to leave the memory folder must be refused
 *   before any path is built from it.
 *
 * Pins: init creates one initial commit by "Forge Director" and is idempotent, an existing
 *   folder without a repository is adopted on first write, reads never create anything,
 *   unsafe slugs are refused.
 * Depends on: adapters/git-project-memory, @forge/core, vitest, git on PATH.
 *   IO: temp folder.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidInputError } from '@forge/core';
import type { ProjectMemory } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProjectMemory } from '#/adapters/git-project-memory/create-project-memory.js';

let root: string;
let memory: ProjectMemory;

const git = (slug: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: join(root, slug), encoding: 'utf8' }).trim();

const source = { type: 'chat', ref: 'the owner said so' } as const;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-pmem-repo-'));
  memory = createProjectMemory({ rootDir: root, now: () => new Date() });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('repository creation', () => {
  it('creates a private git repo with an index and one initial commit, once', async () => {
    await memory.init('shop');
    await memory.init('shop');

    expect(git('shop', 'rev-list', '--count', 'HEAD')).toBe('1');
    expect(git('shop', 'log', '-1', '--format=%an <%ae>|%s')).toBe(
      'Forge Director <forge@localhost>|memory: initialise repository',
    );

    expect(await readFile(join(root, 'shop', 'MEMORY.md'), 'utf8')).toContain(
      '# Memory of shop',
    );
  });

  it('adopts an existing project folder that has no repository yet, on first write', async () => {
    await mkdir(join(root, 'old-shop'), { recursive: true });

    await memory.writer.propose('old-shop', { statement: 'Use pnpm', source });

    expect(git('old-shop', 'rev-list', '--count', 'HEAD')).toBe('2');
  });

  it('reading never creates a repository', async () => {
    expect(await memory.reader.list('ghost')).toEqual([]);
    expect(await memory.reader.get('ghost', 'd-0001')).toBeNull();
    await expect(readdir(join(root, 'ghost'))).rejects.toThrow();
  });

  it('refuses a slug that could leave the memory folder', async () => {
    await expect(memory.init('../evil')).rejects.toThrow(InvalidInputError);
    await expect(
      memory.writer.propose('Evil', { statement: 'x', source }),
    ).rejects.toThrow(InvalidInputError);
  });
});
