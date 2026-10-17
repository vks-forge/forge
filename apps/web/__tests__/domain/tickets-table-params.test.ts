/**
 * Pins: the Tickets table state round-trips through the URL, every invalid part falls back to
 * its own default, and the page-window arithmetic is right.
 *
 * Why: the URL is the only state of the Tickets screen. One bad value (a stale `page=abc`)
 * must not drop the valid filters beside it, and a wrong "x–y of N" would tell the owner
 * they have seen tickets they have not.
 * Depends on: domain/tickets-table-params.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMS,
  hasActiveFilters,
  pageWindow,
  parseTicketsParams,
  toTicketsSearch,
} from '#/domain/tickets-table-params.js';

const parse = (query: string) => parseTicketsParams(new URLSearchParams(query));

describe('parseTicketsParams', () => {
  it('gives the defaults for an empty query', () => {
    expect(parse('')).toEqual(DEFAULT_PARAMS);
  });

  it('keeps valid parts and drops invalid ones independently', () => {
    const params = parse(
      'state=done,bogus,review&lane=bogus&page=abc&size=7&sort=zzz&q=%20csv%20',
    );

    expect(params).toEqual({
      ...DEFAULT_PARAMS,
      states: ['done', 'review'],
      q: 'csv',
    });
  });

  it('accepts the sorts the server offers and refuses others', () => {
    expect(parse('sort=cost').sort).toBe('cost');
    expect(parse('sort=created').sort).toBe('created');
    expect(parse('sort=title').sort).toBe('updated');
  });

  it('cuts a search at the 100 characters the server accepts', () => {
    expect(parse(`q=${'a'.repeat(150)}`).q).toHaveLength(100);
  });

  it('rejects a page below one', () => {
    expect(parse('page=0').page).toBe(1);
    expect(parse('page=-3').page).toBe(1);
    expect(parse('page=2.5').page).toBe(1);
  });
});

describe('toTicketsSearch', () => {
  it('leaves defaults out of the URL', () => {
    expect(toTicketsSearch(DEFAULT_PARAMS).toString()).toBe('');
  });

  it('round-trips every field', () => {
    const params = {
      states: ['done' as const, 'review' as const],
      lane: 'full' as const,
      q: 'a b',
      sort: 'cost' as const,
      page: 3,
      size: 50,
    };

    expect(parseTicketsParams(toTicketsSearch(params))).toEqual(params);
  });
});

describe('pageWindow', () => {
  it('counts the shown window and the pages', () => {
    expect(pageWindow(1, 25, 60)).toEqual({ from: 1, to: 25, pages: 3 });
    expect(pageWindow(3, 25, 60)).toEqual({ from: 51, to: 60, pages: 3 });
    expect(pageWindow(1, 25, 0)).toEqual({ from: 0, to: 0, pages: 1 });
  });
});

describe('hasActiveFilters', () => {
  it('is true only when state, lane or search narrow the list', () => {
    expect(hasActiveFilters(DEFAULT_PARAMS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_PARAMS, page: 2, sort: 'cost' })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_PARAMS, q: 'x' })).toBe(true);
  });
});
