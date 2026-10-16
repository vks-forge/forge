/**
 * OverviewControls: range, grouping, project filter and the archived switch.
 *
 * Why: the Overview answers different questions at different zoom levels (this week by day,
 *   this year by month, one project against the rest), so the four controls that change the
 *   view sit together above the figures and each shows its current choice. Every change is
 *   reported up as one small change object; the page writes it to the URL, which keeps the
 *   view shareable. Archived projects are only offered in the filter when the switch includes
 *   them, and switching them off also drops any archived project already chosen, so the
 *   filter never names something the figures no longer cover.
 *
 * Exports: OverviewControls.
 * Depends on: components/ui/{toggle-group,picker,field,button}, domain/overview-params,
 *   domain/stats-format, schemas/projects (type), types/overview.types.
 */

import type { StatsGroup, StatsRange } from '@forge/core';
import { Picker } from '#/components/ui/picker.js';
import { Switch } from '#/components/ui/field.js';
import { ToggleGroup } from '#/components/ui/toggle-group.js';
import { OVERVIEW_GROUPS, OVERVIEW_RANGES } from '#/domain/overview-params.js';
import type { ProjectView } from '#/schemas/projects.js';
import type { OverviewChange, OverviewFilters } from '#/types/overview.types.js';

const RANGE_LABEL: Readonly<Record<StatsRange, string>> = {
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  '12m': '12m',
  all: 'All',
};

const GROUP_LABEL: Readonly<Record<StatsGroup, string>> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

export function OverviewControls(props: {
  filters: OverviewFilters;
  projects: readonly ProjectView[] | undefined;
  onChange: (change: OverviewChange) => void;
}) {
  const { filters, projects, onChange } = props;
  const all = projects ?? [];
  const archivedSlugs = new Set(
    all.filter((p) => p.status === 'archived').map((p) => p.slug),
  );

  const offered = all.filter(
    (p) =>
      filters.archived || p.status !== 'archived' || filters.projects.includes(p.slug),
  );

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted">Range</span>
        <ToggleGroup
          label="Range"
          value={filters.range}
          options={OVERVIEW_RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
          onChange={(range) => onChange({ range })}
        />
      </div>

      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted">Group by</span>
        <ToggleGroup
          label="Group by"
          value={filters.group}
          options={OVERVIEW_GROUPS.map((g) => ({ value: g, label: GROUP_LABEL[g] }))}
          onChange={(group) => onChange({ group })}
        />
      </div>

      <div className="grid w-full gap-1 sm:w-60">
        <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted">
          Projects
          {filters.projects.length > 0 ? (
            <button
              type="button"
              aria-label="Clear project filter"
              onClick={() => onChange({ projects: [] })}
              className="rounded px-1 font-normal underline hover:text-fg"
            >
              Clear
            </button>
          ) : null}
        </span>
        <Picker
          multiple
          label="Projects"
          placeholder="All projects"
          value={filters.projects}
          items={offered.map((p) => ({
            value: p.slug,
            label: p.slug,
            badge: p.status === 'archived' ? 'archived' : undefined,
          }))}
          loading={projects === undefined}
          emptyText="No projects yet"
          onChange={(next) => onChange({ projects: next })}
        />
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-9">
        <Switch
          label="Include archived projects"
          checked={filters.archived}
          onChange={(archived) =>
            onChange(
              archived
                ? { archived }
                : {
                    archived,
                    projects: filters.projects.filter((slug) => !archivedSlugs.has(slug)),
                  },
            )
          }
        />
        <span aria-hidden="true">Include archived</span>
      </label>
    </div>
  );
}
