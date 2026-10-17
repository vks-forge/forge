/**
 * Pins how the Overview reads its filters from the URL and writes them back.
 *
 * Why: the Overview's range, grouping, project filter and archived toggle live in the URL so a
 *   view can be shared and survives a reload. A bad value must fall back to a safe default
 *   (not crash or ask the server for nonsense), changing the range must let the grouping
 *   follow it again, and the default view must keep a clean URL.
 *
 * Pins: parseOverviewFilters() defaults and fallbacks, nextSearch() per change, request mapping,
 *   the filter button's summary text and its count of non-default filters.
 * Depends on: src/domain/overview-params. Pure.
 */

import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  filterSummary,
  groupsFor,
  nextSearch,
  parseOverviewFilters,
  requestOf,
} from '#/domain/overview-params.js';

const parse = (search: string) => parseOverviewFilters(new URLSearchParams(search));

describe('parseOverviewFilters', () => {
  it('defaults to 30 days by day with every open project', () => {
    expect(parse('')).toEqual({
      range: '30d',
      group: 'day',
      groupChosen: false,
      projects: [],
      archived: false,
    });
  });

  it('lets the grouping follow the range until one is chosen', () => {
    expect(parse('range=90d').group).toBe('week');
    expect(parse('range=12m').group).toBe('month');
    expect(parse('range=all').group).toBe('month');
    expect(parse('range=7d&group=month')).toMatchObject({
      group: 'month',
      groupChosen: true,
    });
  });

  it('reads the project list and the archived flag', () => {
    expect(parse('projects=a,b&archived=1')).toMatchObject({
      projects: ['a', 'b'],
      archived: true,
    });
  });

  it('reads Today, which groups by the hour', () => {
    expect(parse('range=today')).toMatchObject({
      range: 'today',
      group: 'hour',
      groupChosen: false,
    });

    expect(parse('range=today&group=hour').groupChosen).toBe(true);
  });

  it('falls back when the grouping does not fit the range', () => {
    expect(parse('range=today&group=day')).toMatchObject({
      group: 'hour',
      groupChosen: false,
    });

    expect(parse('range=7d&group=hour')).toMatchObject({
      group: 'day',
      groupChosen: false,
    });
  });

  it('falls back on a range or group it does not know', () => {
    expect(parse('range=1y&group=hour')).toMatchObject({
      range: '30d',
      group: 'day',
      groupChosen: false,
    });
  });
});

describe('nextSearch', () => {
  it('leaves the default view with no parameters', () => {
    const base = new URLSearchParams('range=7d');

    expect(nextSearch(base, { range: '30d' }).toString()).toBe('');
  });

  it('drops a chosen grouping when the range changes', () => {
    const base = new URLSearchParams('range=7d&group=week');

    expect(nextSearch(base, { range: '90d' }).toString()).toBe('range=90d');
  });

  it('writes Today, drops a grouping that does not fit it and offers hours only there', () => {
    const base = new URLSearchParams('range=7d&group=week');

    expect(nextSearch(base, { range: 'today' }).toString()).toBe('range=today');
    expect(
      nextSearch(new URLSearchParams('range=today'), { group: 'day' }).toString(),
    ).toBe('range=today');

    expect(groupsFor('today')).toEqual(['hour']);
    expect(groupsFor('30d')).toEqual(['day', 'week', 'month']);
  });

  it('sets the grouping, the projects and the archived flag', () => {
    const next = nextSearch(new URLSearchParams(), {
      group: 'week',
      projects: ['a', 'b'],
      archived: true,
    });

    expect(Object.fromEntries(next)).toEqual({
      group: 'week',
      projects: 'a,b',
      archived: '1',
    });
  });

  it('clears the project list and the archived flag', () => {
    const base = new URLSearchParams('projects=a&archived=1');

    expect(nextSearch(base, { projects: [], archived: false }).toString()).toBe('');
  });
});

describe('requestOf', () => {
  it('asks for the grouping only when the user chose one', () => {
    expect(requestOf(parse('range=90d'))).toEqual({
      range: '90d',
      group: undefined,
      projects: [],
      archived: false,
    });

    expect(requestOf(parse('group=week')).group).toBe('week');
  });
});

describe('filterSummary and activeFilterCount', () => {
  it('summarises the default view and counts nothing', () => {
    const filters = parse('');

    expect(filterSummary(filters)).toBe('30d · Day · All projects');
    expect(activeFilterCount(filters)).toBe(0);
  });

  it('says Today by the hour, with or without the project scope', () => {
    const today = parse('range=today');

    expect(filterSummary(today)).toBe('Today · Hour · All projects');
    expect(filterSummary(today, true)).toBe('Today · Hour');
    expect(activeFilterCount(today)).toBe(1);
  });

  it('names the range, grouping, project scope and archived flag', () => {
    const one = parse('range=12m&group=week&projects=a&archived=1');

    expect(filterSummary(one)).toBe('12m · Week · a · + archived');
    expect(activeFilterCount(one)).toBe(4);
    expect(filterSummary(parse('projects=a,b,c'))).toBe('30d · Day · 3 projects');
    expect(activeFilterCount(parse('projects=a,b,c'))).toBe(1);
  });
});
