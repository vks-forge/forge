/**
 * Runs the shared writer behaviour suite against the git-backed project memory.
 *
 * Why: the database-backed memory is only the same contract as the git-backed one if both pass the same
 *   cases. The git adapter keeps its own tests for what only git has (one commit per write, author, the
 *   generated index, a clean tree); this file puts it through the behaviour every writer must show, so the
 *   suite is a fact about both and not a copy.
 *
 * Pins: the shared writer behaviour on a real git repository in a temp folder.
 * Depends on: adapters/git-project-memory, adapters/file-memory-source, helpers/writer-behaviour, git on PATH.
 *   IO: temp folder, `git`.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileMemorySource } from '#/adapters/file-memory-source.js';
import { createProjectMemory } from '#/adapters/git-project-memory/create-project-memory.js';
import { describeWriterBehaviour } from '#tests/helpers/writer-behaviour.js';

describeWriterBehaviour('git repository', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-pmem-shared-'));
  let ms = Date.parse('2026-10-15T10:00:00.000Z');
  const memory = createProjectMemory({
    rootDir: root,
    now: () => new Date((ms += 1000)),
  });

  const source = createFileMemorySource(root);

  return {
    memory,
    slice: (slug) => source.slice(slug),
    close: () => rm(root, { recursive: true, force: true }),
  };
});
