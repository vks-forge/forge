/**
 * File-backed MemorySource — reads a project's active decisions and rejected approaches.
 *
 * Why: the Director must never plan against a decision the owner superseded, nor repeat
 *   an approach the owner rejected. Memory lives as markdown files in git; this adapter
 *   turns them into the small read-only slice the engine needs. It fails closed: an
 *   unreadable, malformed or unapproved record is skipped and reported, never loaded as
 *   a constraint. `proposed/` and `outcomes/` are never read (memory-system.md, d-0007).
 *
 * Exports: createFileMemorySource().
 * Depends on: node:fs/promises, node:path, @forge/core (MemorySource types),
 *   domain/front-matter, schemas/memory-record, types/memory-source-deps.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { MemoryRecordRef, MemorySlice, MemorySource } from '@forge/core';
import { parseFrontMatter } from '#/domain/front-matter.js';
import { MemoryRecordFrontMatter } from '#/schemas/memory-record.js';
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

async function loadFolder(
  dir: string,
  accepted: readonly (string | undefined)[],
  onSkip: (path: string, reason: string) => void,
): Promise<MemoryRecordRef[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.md'));
  } catch {
    return [];
  }

  const out: MemoryRecordRef[] = [];
  for (const name of names) {
    const path = join(dir, name);
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (err) {
      onSkip(path, `unreadable: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const fm = parseFrontMatter(text);
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
 * Creates a MemorySource reading `<rootDir>/<slug>/{decisions,rejected}/*.md`. While memory
 * is still flat in the factory repo, `<rootDir>/{decisions,rejected}` is used when no slug
 * folder exists. An unknown project, or a slug that is not `[a-z][a-z0-9-]*`, yields an
 * empty slice.
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

      const slugDir = join(rootDir, projectSlug);
      let base: string | null = null;
      if (await isDir(slugDir)) {
        base = slugDir;
      } else if (await isDir(join(rootDir, 'decisions'))) {
        base = rootDir;
      }

      if (base === null) {
        return EMPTY;
      }

      const [decisions, rejected] = await Promise.all([
        loadFolder(join(base, 'decisions'), DECISION_STATUSES, onSkip),
        loadFolder(join(base, 'rejected'), REJECTED_STATUSES, onSkip),
      ]);

      return { decisions, rejected };
    },
  };
}
