/**
 * Pins: how the folder browser orders folders by name and by date modified.
 *
 * Why: people find a folder by its name or by "the one I touched today"; a sort that puts
 * `app10` before `app2`, or buries a folder with an unknown time among the newest, makes the
 * list look random. The sort must also leave the server's list untouched, since the browser
 * reorders a cached listing in place.
 * Depends on: domain/folder-sort.
 */

import type { FolderEntry } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { sortFolders } from '#/domain/folder-sort.js';

const f = (name: string, modified_at: string | null): FolderEntry => ({
  name,
  path: `/x/${name}`,
  is_repo: false,
  modified_at,
});

const LIST = [
  f('app10', '2026-02-01T00:00:00.000Z'),
  f('Zed', '2026-03-01T00:00:00.000Z'),
  f('app2', '2026-01-01T00:00:00.000Z'),
  f('lost', null),
];

const order = (sort: Parameters<typeof sortFolders>[1]) =>
  sortFolders(LIST, sort).map((e) => e.name);

describe('sortFolders', () => {
  it('sorts names naturally and ignoring case, either way', () => {
    expect(order('name_asc')).toEqual(['app2', 'app10', 'lost', 'Zed']);
    expect(order('name_desc')).toEqual(['Zed', 'lost', 'app10', 'app2']);
  });

  it('puts the newest first, and a folder with no time last', () => {
    expect(order('date_desc')).toEqual(['Zed', 'app10', 'app2', 'lost']);
  });

  it('puts the oldest first, and a folder with no time first', () => {
    expect(order('date_asc')).toEqual(['lost', 'app2', 'app10', 'Zed']);
  });

  it('does not change the input', () => {
    const before = LIST.map((e) => e.name);

    sortFolders(LIST, 'name_desc');

    expect(LIST.map((e) => e.name)).toEqual(before);
  });
});
