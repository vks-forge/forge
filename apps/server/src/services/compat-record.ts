/**
 * Reads the native tool names from the catalogue and stores a finished compatibility report.
 *
 * Why: the check has to look for the harness's own tool names (`Bash`, `Agent`), which the
 *   catalogue declares, and its outcome has to land in one transaction: the version row, the
 *   pending tool rows and the harness pause (or its lifting) must never disagree, or a
 *   harness could be paused with nothing to explain it, or run with a failed check on file.
 *   A failed check keeps the owner's binary and login on the row it pauses; a passing one
 *   lifts only a pause, never an error the owner's own test recorded. A tool whose shape
 *   equals one the owner already approved or denied on an earlier build keeps that decision
 *   (stored with `decided_by: carried:<build>`), so an update that did not touch the tools
 *   costs the owner nothing and a Worker is not denied on a build whose shapes are known.
 *
 * Exports: nativeNames(), recordReport().
 * Depends on: @forge/core, @forge/drivers (diffToolShapes), @forge/tools (CatalogueStore).
 *   IO: storage.
 */

import type {
  CompatReport,
  HarnessToolSchema,
  StorageAdapter,
  StorageTx,
} from '@forge/core';
import { diffToolShapes } from '@forge/drivers';
import type { NativeToolNames } from '@forge/drivers';
import type { CatalogueStore } from '@forge/tools';

/** `decided_by` prefix of a row whose decision was copied from an earlier build, not made by the owner. */
const CARRIED = 'carried:';

/**
 * Every approved or denied row of the same harness kind on a build other than `version`.
 * "Most recent" is settled per tool inside `diffToolShapes` by `decided_at` (the moment a
 * decision was made), not by semver or by when a build was checked: a build can be checked
 * long after it was installed, and only the decision times say what the owner last wanted.
 */
async function decidedOnEarlierBuilds(
  tx: StorageTx,
  kind: string,
  version: string,
): Promise<HarnessToolSchema[]> {
  const decided = [
    ...(await tx.harnessToolSchemas.listByStatus('approved')),
    ...(await tx.harnessToolSchemas.listByStatus('denied')),
  ];

  return decided.filter((r) => r.harness_kind === kind && r.version !== version);
}

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
    const earlier = await decidedOnEarlierBuilds(tx, report.kind, report.version);
    const diff = diffToolShapes(report.tools, rows, earlier);
    for (const { shape, from } of diff.carried) {
      await tx.harnessToolSchemas.upsert({
        harness_kind: report.kind,
        version: report.version,
        tool: shape.tool,
        schema_hash: shape.schema_hash,
        status: from.status,
        decided_by: `${CARRIED}${from.version}`,
        decided_at: report.finished_at,
        decision_reason: `Same ${shape.tool} tool shape as build ${from.version}, where it was ${from.status}.`,
      });
    }

    for (const shape of diff.pending) {
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
        ...(harness?.version === undefined ? {} : { version: harness.version }),
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
        ...(harness.last_checked_at === undefined
          ? {}
          : { last_checked_at: harness.last_checked_at }),
      });
    }
  });
}
