/**
 * Gate report storage on disk, written atomically and never overwritten.
 *
 * Why: a gate report is the evidence behind a pass or a rework, and the Ticket screen
 *   links to it by the reference kept on the `gate_results` row. A report that a crash
 *   left half-written would read as a verdict nobody produced, so each file is written
 *   under a temporary name and linked into place. A later report with the same name (a
 *   gate run again on the same head after an error) must not replace the earlier one that
 *   a `gate_results` row still points at, so a taken name gets a numeric suffix. Names and
 *   run ids are checked against a strict pattern first, because they come from gate and
 *   run ids but end up in a path.
 *
 * Exports: createFileReportStore().
 * Depends on: node:fs/promises, node:path, @forge/core (ReportStore, InvalidInputError).
 *   IO: writes `<dataDir>/runs/<runId>/gates/<name>.md`.
 */

import { link, mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { InvalidInputError } from '@forge/core';
import type { ReportStore } from '@forge/core';

const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_VARIANTS = 1_000;

function assertSafe(label: string, value: string): void {
  if (!SAFE.test(value) || value.includes('..')) {
    throw new InvalidInputError(`unsafe ${label} for a report path: ${value}`);
  }
}

/** Stores reports under `<dataDir>/runs/<runId>/gates/`; the returned reference is relative to `dataDir`. */
export function createFileReportStore(dataDir: string): ReportStore {
  return {
    async put(runId, name, text) {
      assertSafe('run id', runId);
      assertSafe('report name', name);

      const base = name.replace(/\.[^.]+$/, '');
      const folder = join(dataDir, 'runs', runId, 'gates');
      const temp = join(folder, `.${base}.${process.pid}.${Date.now()}.tmp`);

      await mkdir(folder, { recursive: true });
      await writeFile(temp, text, 'utf8');

      try {
        for (let n = 1; n <= MAX_VARIANTS; n++) {
          const file = n === 1 ? `${base}.md` : `${base}-${n}.md`;
          try {
            await link(temp, join(folder, file));

            return `runs/${runId}/gates/${file}`;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
              throw error;
            }
          }
        }

        throw new InvalidInputError(`too many reports named ${base} for run ${runId}`);
      } finally {
        await unlink(temp).catch(() => undefined);
      }
    },
  };
}
