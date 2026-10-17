/**
 * OverviewControls: one Filter button that opens a popover holding every dashboard control.
 *
 * Why: range, grouping, project filter and the archived switch used to sit in a row above
 *   the figures and crowded the page header. Behind one button the header stays calm: it shows
 *   only the icon, the word Filter and a count when any filter differs from the clean view.
 *   The full list ("30d · Day · All projects, 2 active") is the button's accessible name, so a
 *   screen reader still hears what is applied. Overview and project Home share it; Home passes
 *   `scoped`, because one project is fixed there and only range and grouping are offered.
 *   Changes apply at once (the page writes them to the URL, so Back steps through them);
 *   Reset returns to the clean view. Escape or an outside click closes the popover and focus
 *   goes back to the button, and the panel never grows wider than the screen.
 *
 * Exports: OverviewControls.
 * Depends on: @radix-ui/react-popover, lucide-react, components/ui/button,
 *   components/overview/overview-filter-fields, domain/overview-params, schemas/projects (type),
 *   types/overview.types.
 */

import * as Popover from '@radix-ui/react-popover';
import { ListFilter } from 'lucide-react';
import { Button } from '#/components/ui/button.js';
import { activeFilterCount, filterSummary } from '#/domain/overview-params.js';
import { OverviewFilterFields } from '#/components/overview/overview-filter-fields.js';
import type { ProjectView } from '#/schemas/projects.js';
import type { OverviewChange, OverviewFilters } from '#/types/overview.types.js';

export function OverviewControls(props: {
  filters: OverviewFilters;
  /** The project list for the project filter; not needed when `scoped`. */
  projects?: readonly ProjectView[] | undefined;
  /** One fixed project: no project filter, no archived switch. */
  scoped?: boolean;
  onChange: (change: OverviewChange) => void;
  onReset: () => void;
}) {
  const { filters, projects, scoped = false, onChange, onReset } = props;
  const active = activeFilterCount(filters);
  const name = `Filter: ${filterSummary(filters, scoped)}${active > 0 ? `, ${active} active` : ''}`;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button className="max-w-full" aria-label={name}>
          <ListFilter aria-hidden="true" className="size-4 shrink-0" />
          <span>Filter</span>
          {active > 0 ? (
            <span className="min-w-5 shrink-0 rounded-full bg-signal px-1.5 text-center text-xs text-on-signal">
              {active}
              <span className="sr-only"> active</span>
            </span>
          ) : null}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="dialog"
          aria-label="Filters"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="z-[70] w-80 max-w-[calc(100vw-1rem)] origin-(--radix-popover-content-transform-origin) rounded-xl border border-line bg-surface p-4 shadow-float animate-[picker-in_120ms_ease-out]"
        >
          <OverviewFilterFields
            filters={filters}
            projects={projects}
            scoped={scoped}
            onChange={onChange}
          />
          <div className="mt-4 flex justify-end border-t border-line pt-3">
            <Button aria-label="Reset filters" disabled={active === 0} onClick={onReset}>
              Reset
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
