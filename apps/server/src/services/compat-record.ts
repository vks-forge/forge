/**
 * Reads the native tool names from the catalogue and stores a finished compatibility report.
 *
 * Why: the check has to look for the harness's own tool names (`Bash`, `Agent`), which the
 *   catalogue declares, and its outcome has to land in one transaction: the version row, the
 *   pending tool rows and the harness pause (or its lifting) must never disagree, or a
 *   harness could be paused with nothing to explain it, or run with a failed check on file.
 *   A failed check keeps the owner's binary and login on the row it pauses; a passing one
 *   lifts only a pause, never an error the owner's own test recorded.
 *
 * Exports: nativeNames(), recordReport().
 * Depends on: @forge/core, @forge/drivers (diffToolShapes), @forge/tools (CatalogueStore).
 *   IO: storage.
 */

import type { CompatReport, StorageAdapter } from '@forge/core';
import { diffToolShapes } from '@forge/drivers';
import type { NativeToolNames } from '@forge/drivers';
import type { CatalogueStore } from '@forge/tools';

/** Catalogue tool id to the harness's own names, read from the current catalogue. */
export async function nativeNames(
  catalogue: CatalogueStore,
  supportKey: string,
): Promise<NativeToolNames> {
  const { doc } = await catalogue.current();
  const out: Record<string, string[]> = {};
  for (const def of doc.entries) {
    const native =
      def.kind === 'harness-native' ? def.support[supportKey]?.native : undefined;

    if (native !== undefined) {
      out[def.id] = Array.isArray(native) ? [...native] : [native];
    }
  }

  return out;
}

/** Stores a finished report: version row, pending tool rows, harness pause or unpause. */
export async function recordReport(
  storage: StorageAdapter,
  harnessId: string,
  report: CompatReport,
): Promise<void> {
  await storage.transaction(async (tx) => {
    await tx.harnessVersions.upsert({
      kind: report.kind,
      version: report.version,
      compat: report.passed ? 'pass' : 'fail',
      report,
      checked_at: report.finished_at,
    });

    const rows = await tx.harnessToolSchemas.list(report.kind, report.version);
    for (const shape of diffToolShapes(report.tools, rows).pending) {
      await tx.harnessToolSchemas.upsert({
        harness_kind: report.kind,
        version: report.version,
        tool: shape.tool,
        schema_hash: shape.schema_hash,
        status: 'pending',
      });
    }

    const harness = await tx.harnesses.get(harnessId);
    if (!report.passed) {
      await tx.harnesses.upsert({
        id: harnessId,
        kind: report.kind,
        ...(harness?.binary_path === undefined
          ? {}
          : { binary_path: harness.binary_path }),
        auth_mode: harness?.auth_mode ?? 'login',
        status: 'paused',
        status_note: report.summary,
        last_checked_at: report.finished_at,
      });
    } else if (harness?.status === 'paused') {
      await tx.harnesses.upsert({
        id: harness.id,
        kind: harness.kind,
        ...(harness.binary_path === undefined
          ? {}
          : { binary_path: harness.binary_path }),
        ...(harness.version === undefined ? {} : { version: harness.version }),
        auth_mode: harness.auth_mode,
        status: 'unknown',
      });
    }
  });
}
