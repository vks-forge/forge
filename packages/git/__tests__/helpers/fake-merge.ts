/**
 * Whole-file three-way merge for the in-memory worktree fake.
 *
 * Why: the engine's conflict routing is tested against the fake, so the fake must reach the
 *   same verdicts real git does for the cases the contract pins: a side that did not change
 *   a file loses to the side that did, two different edits conflict, text conflicts get
 *   markers, binary conflicts keep the ticket's version, and delete-versus-modify keeps the
 *   ticket's side. Files merge line by line only when no side added or removed lines, which is
 *   all the contract needs; real git's full line merging is pinned by the git contract run.
 *
 * Exports: threeWayMerge().
 * Depends on: @forge/core (ConflictFile). No IO.
 */

import type { ConflictFile } from '@forge/core';

/** Per-line merge of same-length versions, or null when a line was changed on both sides or lengths differ. */
function mergeLines(a: string, o: string, t: string): string | null {
  const [la, lo, lt] = [a.split('\n'), o.split('\n'), t.split('\n')];
  if (la.length !== lo.length || la.length !== lt.length) {
    return null;
  }

  const out: string[] = [];
  for (const [i, line] of la.entries()) {
    const [x, y] = [lo[i] as string, lt[i] as string];
    if (x !== line && y !== line && x !== y) {
      return null;
    }

    out.push(x === line ? y : x);
  }

  return out.join('\n');
}

/** Merges `theirs` (the base) into `ours` (the ticket) from their common `ancestor`. */
export function threeWayMerge(
  ancestor: ReadonlyMap<string, string>,
  ours: ReadonlyMap<string, string>,
  theirs: ReadonlyMap<string, string>,
  label: string,
): { files: Map<string, string>; conflicts: ConflictFile[] } {
  const files = new Map(ours);
  const conflicts: ConflictFile[] = [];
  const paths = new Set([...ancestor.keys(), ...ours.keys(), ...theirs.keys()]);

  for (const path of [...paths].sort()) {
    const [a, o, t] = [ancestor.get(path), ours.get(path), theirs.get(path)];
    if (t === a || o === t) {
      continue;
    }

    if (o === a) {
      if (t === undefined) {
        files.delete(path);
      } else {
        files.set(path, t);
      }

      continue;
    }

    if (o === undefined || t === undefined) {
      conflicts.push({
        path,
        binary: (o ?? t ?? '').includes('\0'),
        deletedBy: o === undefined ? 'ticket' : 'base',
      });

      continue;
    }

    const binary = o.includes('\0') || t.includes('\0');
    const lines = binary || a === undefined ? null : mergeLines(a, o, t);
    if (lines !== null) {
      files.set(path, lines);

      continue;
    }

    conflicts.push({ path, binary });
    if (!binary) {
      files.set(path, `<<<<<<< HEAD\n${o}=======\n${t}>>>>>>> ${label}\n`);
    }
  }

  return { files, conflicts };
}
