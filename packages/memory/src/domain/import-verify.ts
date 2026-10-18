/**
 * Import verification — compares what the old files say with what the database holds.
 *
 * Why: the old repository is deleted after the import, so the copy must be proven before that, record by
 *   record: every file is a record or a listed refusal, each record's statement is byte-equal, its body
 *   hashes the same and its tags match, and the counts per kind and status agree. A record the owner has
 *   already approved or superseded since the import has legitimately moved on, so for those only the words
 *   are compared, never the state. Any difference is reported by name and blocks the deletion.
 *
 * Exports: verifyImport(), bodyHash().
 * Depends on: node:crypto, @forge/core (types), types/memory-import. Pure, no IO.
 */

import { createHash } from 'node:crypto';
import type { ImportedRowCheck } from '@forge/core';
import type { ImportPlan, VerifyResult } from '#/types/memory-import.types.js';

export const bodyHash = (body: string): string =>
  createHash('sha256').update(body, 'utf8').digest('hex');

const MAX_REPORTED = 20;

const sameTags = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().every((t, i) => t === [...b].sort()[i]);

/** Lists every way the database differs from the plan; an empty list means the copy is exact. */
export function verifyImport(
  plan: ImportPlan,
  checks: readonly ImportedRowCheck[],
): VerifyResult {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const out: string[] = [];
  const planned = new Set(plan.records.map((r) => r.id));
  const tally = new Map<string, number>();
  const stored = new Map<string, number>();

  const count = (m: Map<string, number>, kind: string, status: string): void => {
    const k = `${kind}/${status}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  };

  if (plan.files !== plan.records.length + plan.rejects.length) {
    out.push(
      `files ${plan.files} is not records ${plan.records.length} plus rejects ${plan.rejects.length}`,
    );
  }

  for (const p of plan.records) {
    const row = byId.get(p.id);
    if (row === undefined) {
      out.push(`${p.id} (${p.path}) is missing from the database`);
      continue;
    }

    if (row.statement !== p.record.statement) {
      out.push(`${p.id}: statement differs`);
    }

    if (row.body_sha256 !== bodyHash(p.record.body)) {
      out.push(`${p.id}: body differs`);
    }

    if (!sameTags(row.tags, p.record.tags)) {
      out.push(`${p.id}: tags differ`);
    }

    if (!row.moved) {
      if (row.kind !== p.record.kind || row.status !== p.record.status) {
        out.push(
          `${p.id}: stored as ${row.kind}/${row.status}, file says ${p.record.kind}/${p.record.status}`,
        );
      }

      count(tally, p.record.kind, p.record.status);
      count(stored, row.kind, row.status);
    }
  }

  for (const c of checks) {
    if (!planned.has(c.id)) {
      out.push(`${c.id} is in the database but in no file of the repository`);
    }
  }

  for (const k of new Set([...tally.keys(), ...stored.keys()])) {
    if ((tally.get(k) ?? 0) !== (stored.get(k) ?? 0)) {
      out.push(
        `count of ${k} differs: files ${tally.get(k) ?? 0}, database ${stored.get(k) ?? 0}`,
      );
    }
  }

  return {
    mismatches:
      out.length > MAX_REPORTED
        ? [...out.slice(0, MAX_REPORTED), `and ${out.length - MAX_REPORTED} more`]
        : out,
    checked: plan.records.length,
  };
}
