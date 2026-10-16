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
 * Exports: OVERVIEW_RANGES, OVERVIEW_GROUPS, parseOverviewFilters(), nextSearch(), requestOf().
 * Depends on: @forge/core (StatsRange, StatsGroup, defaultGroup), types/overview.types. Pure.
 */

import { StatsGroup, StatsRange, defaultGroup } from '@forge/core';
import type {
  OverviewChange,
  OverviewFilters,
  OverviewRequest,
} from '#/types/overview.types.js';

export const OVERVIEW_RANGES: readonly StatsRange[] = ['7d', '30d', '90d', '12m', 'all'];
export const OVERVIEW_GROUPS: readonly StatsGroup[] = ['day', 'week', 'month'];

const DEFAULT_RANGE: StatsRange = '30d';

export function parseOverviewFilters(search: URLSearchParams): OverviewFilters {
  const range = StatsRange.safeParse(search.get('range'));
  const group = StatsGroup.safeParse(search.get('group'));
  const effective = range.success ? range.data : DEFAULT_RANGE;
  const projects = (search.get('projects') ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter((slug) => slug !== '');

  return {
    range: effective,
    group: group.success ? group.data : defaultGroup(effective),
    groupChosen: group.success,
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
  const group = change.group ?? (keepGroup ? filters.group : undefined);
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
