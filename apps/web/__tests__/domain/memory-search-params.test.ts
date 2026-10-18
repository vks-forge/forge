/**
 * Pins: the memory search state and its URL form: the query and every chip survive a round trip
 * through the address, an unknown kind or status in a hand-edited link is dropped rather than
 * sent to the server, comma and repeated forms both read, empty values leave no key, and a
 * query under two characters is not searched.
 *
 * Why: the owner shares and bookmarks searches, and Back must return to the same answer. If a
 * hand-edited link could put junk into the request, or one letter fired a search per keystroke,
 * the screen would either error or flood the server.
 * Depends on: domain/memory-search-params. Pure.
 */

import { describe, expect, it } from 'vitest';
import {
  EMPTY_SEARCH,
  hasChipFilters,
  isSearching,
  readSearchState,
  writeSearchState,
} from '#/domain/memory-search-params.js';

describe('memory search params', () => {
  it('round-trips a full state through the address', () => {
    const state = {
      q: 'full suite',
      kinds: ['decision', 'rejected'],
      statuses: ['active'],
      tags: ['gates', 'tests'],
      superseded: true,
    } as const;

    const written = writeSearchState(new URLSearchParams(), state);

    expect(readSearchState(new URLSearchParams(written.toString()))).toEqual(state);
  });

  it('leaves no key for an empty state', () => {
    expect(
      writeSearchState(
        new URLSearchParams('q=old&kind=decision'),
        EMPTY_SEARCH,
      ).toString(),
    ).toBe('');
  });

  it('drops values it does not know and reads comma and repeated forms', () => {
    const state = readSearchState(
      new URLSearchParams(
        'q=x&kind=decision,bogus&kind=outcome&status=nope&status=superseded&tag= a &tag=a',
      ),
    );

    expect(state.kinds).toEqual(['decision', 'outcome']);
    expect(state.statuses).toEqual(['superseded']);
    expect(state.tags).toEqual(['a']);
  });

  it('searches only from two characters, ignoring spaces', () => {
    expect(isSearching({ q: '' })).toBe(false);
    expect(isSearching({ q: 'p' })).toBe(false);
    expect(isSearching({ q: ' p ' })).toBe(false);
    expect(isSearching({ q: 'pn' })).toBe(true);
  });

  it('knows when a chip narrows the search', () => {
    expect(hasChipFilters(EMPTY_SEARCH)).toBe(false);
    expect(hasChipFilters({ ...EMPTY_SEARCH, q: 'x' })).toBe(false);
    expect(hasChipFilters({ ...EMPTY_SEARCH, superseded: true })).toBe(true);
    expect(hasChipFilters({ ...EMPTY_SEARCH, tags: ['a'] })).toBe(true);
  });
});
