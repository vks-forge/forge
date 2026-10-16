/**
 * Turns what a folder dialog printed into one clean absolute path.
 *
 * Why: each OS tool ends its answer differently (a newline, a trailing slash from macOS
 *   `POSIX path`, a BOM from PowerShell). The project form compares and stores the folder
 *   as text, so every platform must hand back the same spelling; drive roots (`C:\`) and `/`
 *   keep their separator because without it they mean something else.
 *
 * Exports: cleanPath(), picked(), cancelled(), unavailable().
 * Depends on: @forge/core (FolderPick, type). No IO.
 */

import type { FolderPick } from '@forge/core';

/** Output text to a path: no BOM, no trailing newline, no trailing separator except on a root. Empty when nothing was chosen. */
export function cleanPath(raw: string): string {
  const text = raw.replace(/^\uFEFF/, '').replace(/[\r\n]+$/, '');

  if (text.trim() === '') {
    return '';
  }

  if (/^[A-Za-z]:[\\/]*$/.test(text)) {
    return `${text.slice(0, 2)}\\`;
  }

  const trimmed = text.replace(/[\\/]+$/, '');

  return trimmed === '' ? text.slice(0, 1) : trimmed;
}

/** `picked` for non-empty output, `cancelled` for empty. */
export function picked(raw: string): FolderPick {
  const path = cleanPath(raw);

  return path === '' ? { status: 'cancelled' } : { status: 'picked', path };
}

export function cancelled(): FolderPick {
  return { status: 'cancelled' };
}

export function unavailable(reason: string): FolderPick {
  return { status: 'unavailable', reason };
}
