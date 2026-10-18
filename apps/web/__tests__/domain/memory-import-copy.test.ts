/**
 * Pins: which import states mean a project's memory is still in files, and the verified line.
 *
 * Why: search, links, history and export are unavailable until the move is verified. Treating a
 * pending or failed move as "in the database" would show empty Related lists that look like "no
 * relations"; treating a project that never had a repository as "in files" would block export
 * for no reason.
 * Depends on: domain/memory-import-copy. Pure.
 */

import { describe, expect, it } from 'vitest';
import { importLine, isFileBacked } from '#/domain/memory-import-copy.js';

describe('isFileBacked', () => {
  it('is true until the move is verified, and unknown while unread', () => {
    expect(isFileBacked({ state: 'pending' })).toBe(true);
    expect(isFileBacked({ state: 'needs_attention' })).toBe(true);
    expect(isFileBacked({ state: 'failed' })).toBe(true);
    expect(isFileBacked({ state: 'verified' })).toBe(false);
    expect(isFileBacked({ state: 'not_needed' })).toBe(false);
    expect(isFileBacked(undefined)).toBe(false);
  });
});

describe('importLine', () => {
  it('names the date and, once the old repository is gone, the backup', () => {
    expect(
      importLine({
        verified_at: '2026-10-18T09:00:00Z',
        backup_path: 'C:/b',
        repo_deleted_at: '2026-10-18T09:00:01Z',
      }),
    ).toBe(
      'Memory is stored in Forge’s database (migrated 2026-10-18; old repository removed after backup C:/b).',
    );

    expect(
      importLine({ verified_at: null, backup_path: null, repo_deleted_at: null }),
    ).toBe('Memory is stored in Forge’s database (migrated).');

    expect(
      importLine({
        verified_at: '2026-10-18',
        backup_path: 'C:/b',
        repo_deleted_at: null,
      }),
    ).toContain('; backup C:/b');
  });
});
