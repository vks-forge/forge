/**
 * Overview filters in the URL: reading them, writing them back, and the request they make.
 *
 * Why: the Overview's range, grouping, project filter and archived toggle live in the URL
 *   search string so a view can be shared, bookmarked and survives a reload, and the Back
 *   button steps through filter changes. A value the app does not know falls back to the
 *   default instead of reaching the server. The grouping follows the range (a year read by
 *   day is noise) until the user picks one; changing the range hands it back. The default
 *   view keeps a clean URL (no parameters) so `/` stays `/`.
 *
 *   The filter button's accessible summary and its count of non-default filters are derived
 *   here too, so the button, the tests and the URL agree on what "default" means.
 *
 *   Today groups by the hour and only by the hour; every other range groups by day, week or
 *   month. A grouping that does not fit the range (a hand-edited URL) falls back to the default.
 *
 * Exports: OVERVIEW_RANGES, OVERVIEW_GROUPS, RANGE_LABEL, GROUP_LABEL, groupsFor(),
 *   parseOverviewFilters(), nextSearch(), requestOf(), filterSummary(), activeFilterCount().
 * Depends on: @forge/core (StatsRange, StatsGroup, defaultGroup), types/overview.types. Pure.
 */

import { StatsGroup, StatsRange, defaultGroup } from '@forge/core';
import type {
  OverviewChange,
  OverviewFilters,
  OverviewRequest,
} from '#/types/overview.types.js';

export const OVERVIEW_RANGES: readonly StatsRange[] = [
  'today',
  '7d',
  '30d',
  '90d',
  '12m',
  'all',
];
export const OVERVIEW_GROUPS: readonly StatsGroup[] = ['hour', 'day', 'week', 'month'];

/** The groupings that fit a range: hours for today, otherwise day, week or month. */
export function groupsFor(range: StatsRange): readonly StatsGroup[] {
  return range === 'today' ? ['hour'] : ['day', 'week', 'month'];
}

export const RANGE_LABEL: Readonly<Record<StatsRange, string>> = {
  today: 'Today',
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  '12m': '12m',
  all: 'All',
};

export const GROUP_LABEL: Readonly<Record<StatsGroup, string>> = {
  hour: 'Hour',
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

const DEFAULT_RANGE: StatsRange = '30d';

export function parseOverviewFilters(search: URLSearchParams): OverviewFilters {
  const range = StatsRange.safeParse(search.get('range'));
  const parsedGroup = StatsGroup.safeParse(search.get('group'));
  const effective = range.success ? range.data : DEFAULT_RANGE;
  const fits = parsedGroup.success && groupsFor(effective).includes(parsedGroup.data);
  const projects = (search.get('projects') ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter((slug) => slug !== '');

  return {
    range: effective,
    group: fits && parsedGroup.success ? parsedGroup.data : defaultGroup(effective),
    groupChosen: fits,
    projects: [...new Set(projects)],
    archived: search.get('archived') === '1',
  };
}

/** The search string after one change; a changed range lets the grouping follow it again. */
export function nextSearch(
  current: URLSearchParams,
  change: OverviewChange,
): URLSearchParams {
  const filters = parseOverviewFilters(current);
  const range = change.range ?? filters.range;
  const keepGroup = change.range === undefined && filters.groupChosen;
  const wanted = change.group ?? (keepGroup ? filters.group : undefined);
  const group =
    wanted !== undefined && groupsFor(range).includes(wanted) ? wanted : undefined;

  const projects = change.projects ?? filters.projects;
  const archived = change.archived ?? filters.archived;
  const next = new URLSearchParams();

  if (range !== DEFAULT_RANGE) {
    next.set('range', range);
  }

  if (group !== undefined) {
    next.set('group', group);
  }

  if (projects.length > 0) {
    next.set('projects', projects.join(','));
  }

  if (archived) {
    next.set('archived', '1');
  }

  return next;
}

/** What to ask the server: the grouping only when the user chose one. */
export function requestOf(filters: OverviewFilters): OverviewRequest {
  return {
    range: filters.range,
    group: filters.groupChosen ? filters.group : undefined,
    projects: filters.projects,
    archived: filters.archived,
  };
}

/** How many filters differ from the clean view (the grouping counts only once chosen). */
export function activeFilterCount(filters: OverviewFilters): number {
  return [
    filters.range !== DEFAULT_RANGE,
    filters.groupChosen,
    filters.projects.length > 0,
    filters.archived,
  ].filter(Boolean).length;
}

/**
 * The filters in a few words for the button's accessible name, e.g. `30d · Day · All projects`.
 * `scoped` leaves the project scope out (Home is always one project).
 */
export function filterSummary(filters: OverviewFilters, scoped = false): string {
  if (scoped) {
    return [RANGE_LABEL[filters.range], GROUP_LABEL[filters.group]].join(' · ');
  }

  const scope =
    filters.projects.length === 0
      ? 'All projects'
      : filters.projects.length === 1
        ? (filters.projects[0] ?? '')
        : `${filters.projects.length} projects`;

  return [
    RANGE_LABEL[filters.range],
    GROUP_LABEL[filters.group],
    scope,
    ...(filters.archived ? ['+ archived'] : []),
  ].join(' · ');
}
