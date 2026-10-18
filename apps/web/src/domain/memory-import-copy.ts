/**
 * What the import status means for the screen, in words.
 *
 * Why: until a project's old memory repository is imported and verified, its memory still lives
 *   in files: search answers 409, links and history are unknown and export is refused. The
 *   screens need one answer to "is this project in the database yet?" and one sentence for each
 *   state the owner can see, including the one that asks for action (some files could not be
 *   read). Keeping both here means the banner, the record page and the export button agree.
 *
 * Exports: isFileBacked(), importLine(), RETRY_REFUSALS.
 * Depends on: @forge/core (types). Pure.
 */

import type { MemoryImportStatus } from '@forge/core';

/** True while the project's memory is still read from its old repository. */
export function isFileBacked(
  status: Pick<MemoryImportStatus, 'state'> | undefined,
): boolean {
  return (
    status !== undefined &&
    (status.state === 'pending' ||
      status.state === 'needs_attention' ||
      status.state === 'failed')
  );
}

/** Words for the 409 codes a retry or an export can answer with. */
export const RETRY_REFUSALS: Readonly<Record<string, string>> = {
  memory_import_running:
    'An import is already running. It finishes by itself; this page updates when it does.',
  memory_not_migrated:
    'Export is available once the project’s memory is stored in Forge’s database.',
};

/** The quiet line for a verified project. */
export function importLine(
  status: Pick<MemoryImportStatus, 'verified_at' | 'backup_path' | 'repo_deleted_at'>,
): string {
  const when = status.verified_at
    ? `migrated ${status.verified_at.slice(0, 10)}`
    : 'migrated';

  const backup =
    status.backup_path && status.repo_deleted_at
      ? `; old repository removed after backup ${status.backup_path}`
      : status.backup_path
        ? `; backup ${status.backup_path}`
        : '';

  return `Memory is stored in Forge’s database (${when}${backup}).`;
}
