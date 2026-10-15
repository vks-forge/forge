/**
 * File-backed MemorySource — reads a project's active decisions and rejected approaches.
 *
 * Why: the Director must never plan against a decision the owner superseded, nor repeat
 *   an approach the owner rejected. Memory lives as markdown files in git; this adapter
 *   turns them into the small read-only slice the engine needs. It reads the last commit,
 *   never the working tree, so a write in flight (an old decision already marked
 *   superseded, its successor not yet written) can never show a tick a torn state. It
 *   fails closed: an unreadable, malformed or unapproved record is skipped and reported,
 *   never loaded as a constraint. `proposed/` and `outcomes/` are never read (memory-system.md, d-0007).
 *   The root is the project memory folder in the data home; this repository's own
 *   `.forge/memory` is the dev team's memory and is never read by the product (d-0086).
 *
 * Exports: createFileMemorySource().
 * Depends on: node:fs/promises, node:path, @forge/core (MemorySource types),
 *   domain/front-matter, schemas/memory-record, shared/committed-files,
 *   types/memory-source-deps. IO: `git` in one project's folder.
 */

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { MemoryRecordRef, MemorySlice, MemorySource } from '@forge/core';
import { parseFrontMatter } from '#/domain/front-matter.js';
import { MemoryRecordFrontMatter } from '#/schemas/memory-record.js';
import { readCommittedFiles } from '#/shared/committed-files.js';
import type { CommittedFile } from '#/types/git.types.js';
import type { MemorySourceDeps } from '#/types/memory-source-deps.types.js';

const SLUG = /^[a-z][a-z0-9-]*$/;
const EMPTY: MemorySlice = { decisions: [], rejected: [] };

/** Statuses a record may carry and still count; `undefined` means the field is absent. */
const DECISION_STATUSES: readonly (string | undefined)[] = ['active'];
const REJECTED_STATUSES: readonly (string | undefined)[] = [
  undefined,
  'active',
  'rejected',
];

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isRepo(path: string): Promise<boolean> {
  try {
    await stat(join(path, '.git'));

    return true;
  } catch {
    return false;
  }
}

function toRefs(
  base: string,
  files: readonly CommittedFile[],
  folder: string,
  accepted: readonly (string | undefined)[],
  onSkip: (path: string, reason: string) => void,
): MemoryRecordRef[] {
  const out: MemoryRecordRef[] = [];
  for (const file of files.filter((f) => f.relPath.startsWith(`${folder}/`))) {
    const path = join(base, ...file.relPath.split('/'));
    const fm = parseFrontMatter(file.text);
    if (!fm.ok) {
      onSkip(path, fm.reason);
      continue;
    }

    const rec = MemoryRecordFrontMatter.safeParse(fm.data);
    if (!rec.success) {
      onSkip(
        path,
        rec.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );

      continue;
    }

    if (accepted.includes(rec.data.status)) {
      out.push({ id: rec.data.id, statement: rec.data.statement });
    }
  }

  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Creates a MemorySource reading `<rootDir>/<slug>/{decisions,rejected}/*.md`, where
 * `rootDir` is `<dataHome>/memory`. An unknown project, or a slug that is not
 * `[a-z][a-z0-9-]*`, yields an empty slice.
 */
export function createFileMemorySource(
  rootDir: string,
  deps: MemorySourceDeps = {},
): MemorySource {
  const onSkip = deps.onSkip ?? ((): void => undefined);

  return {
    async slice(projectSlug: string): Promise<MemorySlice> {
      if (!SLUG.test(projectSlug)) {
        onSkip(projectSlug, 'invalid project slug');

        return EMPTY;
      }

      const base = join(rootDir, projectSlug);
      if (!(await isRepo(base))) {
        if (await isDir(base)) {
          onSkip(base, 'not a git repository; memory is read from commits only');
        }

        return EMPTY;
      }

      let files: CommittedFile[];
      try {
        files = await readCommittedFiles(base, ['decisions', 'rejected']);
      } catch (err) {
        onSkip(base, `unreadable: ${err instanceof Error ? err.message : String(err)}`);

        return EMPTY;
      }

      return {
        decisions: toRefs(base, files, 'decisions', DECISION_STATUSES, onSkip),
        rejected: toRefs(base, files, 'rejected', REJECTED_STATUSES, onSkip),
      };
    },
  };
}
