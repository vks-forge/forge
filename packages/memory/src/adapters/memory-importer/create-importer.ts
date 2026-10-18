/**
 * Memory importer — brings a project's old git repository into the database, proves the copy and removes it.
 *
 * Why: earlier versions kept each project's memory as markdown in a private git repository. This release keeps
 *   it in the database, and the repository is deleted afterwards, so nothing may be lost on the way. The
 *   importer reads the last commit, stores every record it can (a hand-written header that strict YAML
 *   rejects still becomes a record), lists every file it refused, then compares the database with the files
 *   record by record. Only when nothing was refused and nothing differs is the attempt `verified`; anything
 *   else is `needs_attention` and the repository stays, untouched and still the source of truth for that
 *   project. Deleting is a separate, narrower step that re-checks that HEAD is still the commit read, that
 *   the folder is the project's own repository inside the memory folder and that nothing is uncommitted. Every
 *   attempt is a row, so a crash between the import and the deletion leaves both and the next start can
 *   verify again and finish. Importing twice inserts nothing twice.
 *
 * Exports: createMemoryImporter(), importStatusOf().
 * Depends on: node:fs/promises, node:path, @forge/core, adapters/memory-importer/read-source,
 *   domain/import-plan, domain/import-rows, domain/import-verify, types/memory-import.
 *   IO: `git` and the project's memory folder.
 */

import { rm } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import type { MemoryImportRecord, MemoryImportStatus, MemoryImporter } from '@forge/core';
import {
  hasRepo,
  headOf,
  isCleanTree,
  readImportSource,
  repoDirOf,
} from '#/adapters/memory-importer/read-source.js';
import { planImport } from '#/domain/import-plan.js';
import { toImportRows } from '#/domain/import-rows.js';
import { bodyHash, verifyImport } from '#/domain/import-verify.js';
import type { ImportDeps, ImportPlan } from '#/types/memory-import.types.js';

/** The status the API and the web read: the latest attempt, or `not_needed` when there never was one. */
export function importStatusOf(record: MemoryImportRecord | null): MemoryImportStatus {
  if (record === null) {
    return {
      state: 'not_needed',
      head_sha: null,
      files: 0,
      imported: 0,
      lenient: 0,
      rejects: [],
      verified_at: null,
      backup_path: null,
      repo_deleted_at: null,
      message: null,
    };
  }

  const { attempt: _attempt, at: _at, ...rest } = record;
  void _attempt;
  void _at;

  return rest;
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const lenientCount = (plan: ImportPlan): number =>
  plan.records.filter((p) => p.record.lenient || p.record.defaulted.length > 0).length;

export function createMemoryImporter(deps: ImportDeps): MemoryImporter {
  const { storage } = deps;
  const atNow = (): string => deps.now().toISOString();

  const latest = (project: string) =>
    storage.transaction((tx) => tx.memory.importState(project));

  const save = (project: string, record: MemoryImportRecord) =>
    storage.transaction((tx) => tx.memory.saveImport(project, record));

  /** Paths already imported, with the id each got, so a second attempt keeps them. */
  async function knownIds(project: string): Promise<Map<string, string>> {
    const rows = await storage.transaction((tx) => tx.memory.list(project));

    return new Map(
      rows.flatMap((r) =>
        r.imported_from === null
          ? []
          : [[r.imported_from.split('@')[0] as string, r.id] as const],
      ),
    );
  }

  async function plan(project: string) {
    const dir = repoDirOf(deps.rootDir, project);
    const source = await readImportSource(dir);

    return {
      source,
      plan: planImport(source.files, atNow().slice(0, 10), await knownIds(project)),
    };
  }

  /** Compares the database with the plan; returns the problems (empty when exact). */
  async function problems(project: string, p: ImportPlan): Promise<string[]> {
    const checks = await storage.transaction((tx) => tx.memory.checksForImport(project));

    return [...verifyImport(p, checks).mismatches];
  }

  function finish(
    base: MemoryImportRecord,
    p: ImportPlan,
    issues: readonly string[],
  ): MemoryImportRecord {
    const ok = p.rejects.length === 0 && issues.length === 0;
    const messages = [
      p.rejects.length > 0 ? `${p.rejects.length} file(s) could not be read` : null,
      issues.length > 0
        ? `${issues.length} difference(s): ${issues.slice(0, 3).join('; ')}`
        : null,
    ].filter((m): m is string => m !== null);

    return {
      ...base,
      state: ok ? 'verified' : 'needs_attention',
      files: p.files,
      imported: p.records.length,
      lenient: lenientCount(p),
      rejects: [...p.rejects],
      verified_at: ok ? atNow() : null,
      message: ok ? null : messages.join('. '),
    };
  }

  return {
    async import(project, backupPath) {
      const previous = await latest(project);
      const attempt = (previous?.attempt ?? 0) + 1;
      const base: MemoryImportRecord = {
        attempt,
        at: atNow(),
        state: 'pending',
        head_sha: null,
        files: 0,
        imported: 0,
        lenient: 0,
        rejects: [],
        backup_path: backupPath,
        verified_at: null,
        repo_deleted_at: null,
        message: null,
      };

      try {
        const { source, plan: p } = await plan(project);
        const started = { ...base, head_sha: source.headSha, files: p.files };
        await save(project, started);

        const conflicts: { path: string; reason: string }[] = [];
        await storage.transaction(async (tx) => {
          for (const planned of p.records) {
            const rows = toImportRows(project, planned, source.headSha, base.at);
            const existing = await tx.memory.get(project, planned.id);
            if (existing === null) {
              await tx.memory.insertRecord(rows.row, rows.tags, rows.links, rows.event);
            } else if (
              existing.statement !== rows.row.statement ||
              bodyHash(existing.body) !== bodyHash(rows.row.body)
            ) {
              conflicts.push({
                path: planned.path,
                reason: `${planned.id} already exists with different words`,
              });
            }
          }

          await tx.memory.reindex(project);
        });

        const kept: ImportPlan = {
          ...p,
          records: p.records.filter((r) => !conflicts.some((c) => c.path === r.path)),
          rejects: [...p.rejects, ...conflicts],
        };

        const done = finish(started, kept, await problems(project, kept));
        await save(project, done);

        return importStatusOf(done);
      } catch (error) {
        const failed: MemoryImportRecord = {
          ...base,
          state: 'failed',
          message: describe(error),
        };

        await save(project, failed);

        return importStatusOf(failed);
      }
    },

    async verify(project) {
      const record = await latest(project);
      if (record === null || record.repo_deleted_at !== null) {
        return importStatusOf(record);
      }

      try {
        const { source, plan: p } = await plan(project);
        const issues = await problems(project, p);
        if (record.head_sha !== source.headSha) {
          issues.unshift(
            `the repository changed since the import (${record.head_sha ?? 'no commit'} to ${source.headSha ?? 'no commit'})`,
          );
        }

        const done = finish(record, p, issues);
        const kept: MemoryImportRecord = {
          ...done,
          verified_at: done.state === 'verified' ? done.verified_at : null,
          repo_deleted_at: record.repo_deleted_at,
          backup_path: record.backup_path,
        };

        await save(project, kept);

        return importStatusOf(kept);
      } catch (error) {
        const failed: MemoryImportRecord = {
          ...record,
          state: 'failed',
          message: describe(error),
        };

        await save(project, failed);

        return importStatusOf(failed);
      }
    },

    async deleteRepo(project) {
      const record = await latest(project);
      if (
        record === null ||
        record.state !== 'verified' ||
        record.repo_deleted_at !== null
      ) {
        return false;
      }

      let dir: string;
      try {
        dir = repoDirOf(deps.rootDir, project);
      } catch {
        return false;
      }

      const root = resolve(deps.rootDir);
      const target = resolve(dir);
      if (
        !target.startsWith(`${root}${sep}`) ||
        basename(target) !== project ||
        !(await hasRepo(target))
      ) {
        return false;
      }

      // A commit that landed since the import, or a change not yet committed, means the copy is stale.
      if ((await headOf(target)) !== record.head_sha || !(await isCleanTree(target))) {
        return false;
      }

      await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      await save(project, { ...record, repo_deleted_at: atNow() });

      return true;
    },
  };
}
