/**
 * Sorting of the folder browser's list: by name or by date modified, either direction.
 *
 * Why: people look for a folder by name ("billing") or by recency ("the one I made today").
 *   The server lists folders A to Z; the browser reorders them locally so changing the order
 *   costs no request. Names compare case-insensitively with numbers in natural order
 *   (`app2` before `app10`). A folder with no known time sorts last when newest-first and
 *   first when oldest-first, so it never hides among recent ones. Pure, no IO.
 *
 * Exports: FOLDER_SORTS, sortFolders().
 * Depends on: @forge/core (FolderEntry, type), types/onboarding.types.
 */

import type { FolderEntry } from '@forge/core';
import type { FolderSort } from '#/types/onboarding.types.js';

export const FOLDER_SORTS: readonly { value: FolderSort; label: string }[] = [
  { value: 'name_asc', label: 'Name A to Z' },
  { value: 'name_desc', label: 'Name Z to A' },
  { value: 'date_desc', label: 'Date modified, newest first' },
  { value: 'date_asc', label: 'Date modified, oldest first' },
];

const byName = (a: FolderEntry, b: FolderEntry): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

const time = (entry: FolderEntry): number =>
  entry.modified_at === null ? Number.NEGATIVE_INFINITY : Date.parse(entry.modified_at);

/** A new array in the chosen order; the input is untouched. */
export function sortFolders(
  entries: readonly FolderEntry[],
  sort: FolderSort,
): FolderEntry[] {
  const copy = [...entries];

  switch (sort) {
    case 'name_asc':
      return copy.sort(byName);
    case 'name_desc':
      return copy.sort((a, b) => byName(b, a));
    case 'date_desc':
      return copy.sort((a, b) => time(b) - time(a) || byName(a, b));
    case 'date_asc':
      return copy.sort((a, b) => time(a) - time(b) || byName(a, b));
  }
}
