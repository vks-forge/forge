/**
 * Parser for `git diff --name-status -z` output.
 *
 * Why: the gates judge what a run really changed, and need each file's status (added,
 *   modified, deleted, renamed) rather than only its name. With `-z` file names containing
 *   spaces or newlines arrive intact; renames carry two paths, so a naive line split would
 *   misread them. Unusual statuses (type change, copy) fold into the nearest of the four
 *   statuses the port exposes.
 *
 * Exports: parseNameStatus().
 * Depends on: @forge/core (WorktreeDiffFile type), CrashError. No IO.
 */

import { CrashError } from '@forge/core';
import type { WorktreeDiffFile } from '@forge/core';

/** Parses NUL-separated `--name-status` output into diff file entries, sorted by path. */
export function parseNameStatus(out: string): WorktreeDiffFile[] {
  const parts = out.split('\0');
  if (parts.at(-1) === '') {
    parts.pop();
  }

  const files: WorktreeDiffFile[] = [];
  for (let i = 0; i < parts.length;) {
    const code = parts[i++] ?? '';
    const letter = code.charAt(0);
    if (letter === 'R' || letter === 'C') {
      const oldPath = parts[i++];
      const path = parts[i++];
      if (oldPath === undefined || path === undefined) {
        throw new CrashError('malformed git name-status output');
      }

      files.push(letter === 'R' ? { status: 'R', path, oldPath } : { status: 'A', path });
      continue;
    }

    const path = parts[i++];
    if (path === undefined) {
      throw new CrashError('malformed git name-status output');
    }

    const status = letter === 'A' ? 'A' : letter === 'D' ? 'D' : 'M';
    files.push({ status, path });
  }

  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
