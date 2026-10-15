/**
 * Git-backed project memory — the Director's writer and the read side, one repo per project.
 *
 * Why: the Director must remember what each project's owner decided and what they ruled
 *   out, and nothing else may write it. Every change here is one commit in
 *   `<dataHome>/memory/<slug>/` by "Forge Director", so the owner can read the history,
 *   diff it and revert it. Writes to one project run one at a time (two writers would pick
 *   the same id), files land atomically, and a state move never edits `statement`,
 *   `source`, `author` or `origin`. A write that died halfway is repaired before the next one
 *   so no commit carries another write's leftovers, and readers see only committed state.
 *   The folder sits in the data home, which the Worker floor denies by absolute path, so a
 *
 * Exports: createProjectMemory().
 * Depends on: node:fs/promises, node:path, @forge/core (ports, errors), domain/memory-plans,
 *   shared/serial-queue, adapters/git-project-memory/repo, adapters/git-project-memory/records,
 *   types/project-memory.
 *   IO: one project's folder and `git`.
 */

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { InvalidInputError, MEMORY_ID_PATTERN } from '@forge/core';
import type {
  MemoryListEntry,
  MemoryRecordWithBody,
  MemoryWriteResult,
  MemoryWriter,
  ProjectMemory,
} from '@forge/core';
import {
  planApprove,
  planDecide,
  planOutcome,
  planPropose,
  planReject,
  planSupersede,
} from '#/domain/memory-plans.js';
import {
  loadCommittedRecords,
  loadRecords,
} from '#/adapters/git-project-memory/records.js';
import { createSerialQueue } from '#/shared/serial-queue.js';
import {
  applyChange,
  ensureRepo,
  recoverRepo,
} from '#/adapters/git-project-memory/repo.js';
import type {
  MemoryPlanner,
  ProjectMemoryDeps,
  StoredRecord,
} from '#/types/project-memory.types.js';

const SLUG = /^[a-z][a-z0-9-]*$/;
const LIST_ORDER = { proposed: 0, decisions: 1, rejected: 2, outcomes: 3 } as const;

export function createProjectMemory(deps: ProjectMemoryDeps): ProjectMemory {
  const queue = createSerialQueue();
  const onSkip = deps.onSkip ?? ((): void => undefined);

  const dirOf = (slug: string): string => {
    if (!SLUG.test(slug)) {
      throw new InvalidInputError(`invalid project slug ${JSON.stringify(slug)}`);
    }

    return join(deps.rootDir, slug);
  };

  /** One write: ensure the repository, repair any crashed write, plan from what is on disk, apply, commit; all in the project's queue. */
  async function write(slug: string, plan: MemoryPlanner): Promise<MemoryWriteResult> {
    const dir = dirOf(slug);

    return queue.run(slug, async () => {
      await ensureRepo(slug, dir, onSkip);
      await recoverRepo(slug, dir, onSkip);
      const change = plan(await loadRecords(dir, onSkip), deps.now().toISOString());

      return { id: change.id, commit: await applyChange(slug, dir, change, onSkip) };
    });
  }

  /** Reads the last commit, never a write in flight, never creating a repository; an unknown project reads as empty. */
  async function read(slug: string): Promise<StoredRecord[]> {
    if (!SLUG.test(slug)) {
      return [];
    }

    const dir = join(deps.rootDir, slug);

    return queue.run(slug, async () => {
      try {
        await stat(join(dir, '.git'));
      } catch {
        return [];
      }

      return loadCommittedRecords(dir, onSkip);
    });
  }

  const writer: MemoryWriter = {
    propose: (slug, input) => write(slug, (rs, at) => planPropose(rs, at, input)),
    decide: (slug, input) => write(slug, (rs, at) => planDecide(rs, at, input)),
    approve: (slug, id, by) => write(slug, (rs, at) => planApprove(rs, at, id, by)),
    reject: (slug, id, reason, by) =>
      write(slug, (rs, at) => planReject(rs, at, id, reason, by)),
    supersede: (slug, oldId, input) =>
      write(slug, (rs, at) => planSupersede(rs, at, oldId, input)),
    appendOutcome: (slug, text) => write(slug, (rs, at) => planOutcome(rs, at, text)),
  };

  return {
    async init(slug) {
      const dir = dirOf(slug);

      await queue.run(slug, () => ensureRepo(slug, dir, onSkip));
    },

    reader: {
      async list(slug): Promise<readonly MemoryListEntry[]> {
        const records = (await read(slug)).filter((r) => r.folder !== 'outcomes');

        return records
          .sort(
            (a, b) =>
              LIST_ORDER[a.folder] - LIST_ORDER[b.folder] ||
              a.record.id.localeCompare(b.record.id),
          )
          .map(({ record }) => ({
            id: record.id,
            kind: record.kind,
            status: record.status,
            statement: record.statement,
            tags: record.tags,
          }));
      },

      async get(slug, id): Promise<MemoryRecordWithBody | null> {
        if (!MEMORY_ID_PATTERN.test(id)) {
          return null;
        }

        const found = (await read(slug)).find((r) => r.record.id === id);

        return found ? { ...found.record, body: found.body } : null;
      },
    },

    writer,
  };
}
