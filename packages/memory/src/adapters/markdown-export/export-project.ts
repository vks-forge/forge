/**
 * Markdown export of a project's memory — the database written out as the files the old repository held.
 *
 * Why: the owner can read, diff and review project memory as plain files, and the repository mirror
 *   (d-0086) reads this folder, so an export must be exact and repeatable: it reads the rows in one
 *   transaction (a consistent view), renders them with no clock inside (two exports of an unchanged memory
 *   are identical) and writes only under the folder it is given, which the server places in the data home's
 *   `exports/` folder and never inside a project's own repository. The export never touches the database.
 *
 * Exports: createMarkdownExporter().
 * Depends on: node:fs/promises, node:path, @forge/core, domain/export-render, types/memory-import.
 *   IO: reads storage, writes files under the given folder.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { MemoryLinkRow } from '@forge/core';
import { renderExport } from '#/domain/export-render.js';
import type {
  ExportDeps,
  ExportFile,
  MarkdownExporter,
} from '#/types/memory-import.types.js';

export function createMarkdownExporter(deps: ExportDeps): MarkdownExporter {
  async function render(project: string): Promise<ExportFile[]> {
    return deps.storage.transaction(async (tx) => {
      const rows = await tx.memory.list(project);
      const tags = await tx.memory.tagsOf(
        project,
        rows.map((r) => r.id),
      );

      const links: Record<string, MemoryLinkRow[]> = {};
      for (const row of rows) {
        links[row.id] = [...(await tx.memory.linksOf(project, row.id)).out];
      }

      return renderExport({ project, rows, tags, links });
    });
  }

  return {
    render,

    async exportTo(project, dir) {
      const files = await render(project);
      for (const file of files) {
        const path = join(dir, ...file.relPath.split('/'));
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, file.text, 'utf8');
      }

      return { path: dir, files: files.length, at: deps.now().toISOString() };
    },
  };
}
