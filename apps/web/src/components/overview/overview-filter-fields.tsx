/**
 * OverviewFilterFields: the dashboard controls, stacked with small labels.
 *
 * Why: the controls that change the Overview's view (range, grouping, project filter,
 *   archived switch) live inside one Filter popover so the page header stays calm. Each
 *   change is reported up as one small change object and the page writes it to the URL, which
 *   keeps the view shareable. Today offers only the Hour grouping, every other range Day, Week
 *   and Month. On a project's Home (`scoped`) the project filter and archived switch are left
 *   out, since the project is fixed. Archived projects are only offered in the project filter when the
 *   switch includes them, and switching them off also drops any archived project already
 *   chosen, so the filter never names something the figures no longer cover.
 *
 * Exports: OverviewFilterFields.
 * Depends on: components/ui/{toggle-group,picker,field}, domain/overview-params,
 *   schemas/projects (type), types/overview.types.
 */

import { Picker } from '#/components/ui/picker.js';
import { Switch } from '#/components/ui/field.js';
import { ToggleGroup } from '#/components/ui/toggle-group.js';
import {
  GROUP_LABEL,
  OVERVIEW_RANGES,
  RANGE_LABEL,
  groupsFor,
} from '#/domain/overview-params.js';
import type { ProjectView } from '#/schemas/projects.js';
import type { OverviewChange, OverviewFilters } from '#/types/overview.types.js';

export function OverviewFilterFields(props: {
  filters: OverviewFilters;
  projects?: readonly ProjectView[] | undefined;
  /** One fixed project: show range and grouping only. */
  scoped?: boolean;
  onChange: (change: OverviewChange) => void;
}) {
  const { filters, projects, scoped = false, onChange } = props;
  const all = projects ?? [];
  const archivedSlugs = new Set(
    all.filter((p) => p.status === 'archived').map((p) => p.slug),
  );

  const offered = all.filter(
    (p) =>
      filters.archived || p.status !== 'archived' || filters.projects.includes(p.slug),
  );

  return (
    <div className="grid gap-4">
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
          options={groupsFor(filters.range).map((g) => ({
            value: g,
            label: GROUP_LABEL[g],
          }))}
          onChange={(group) => onChange({ group })}
        />
      </div>

      {scoped ? null : (
        <>
          <div className="grid gap-1">
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
                        projects: filters.projects.filter(
                          (slug) => !archivedSlugs.has(slug),
                        ),
                      },
                )
              }
            />
            <span aria-hidden="true">Include archived</span>
          </label>
        </>
      )}
    </div>
  );
}
