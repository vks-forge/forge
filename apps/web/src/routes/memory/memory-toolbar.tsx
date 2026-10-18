/**
 * MemoryToolbar: tag filter, hide-superseded and the shown-count for the tab list.
 *
 * Why: a project that has run for months has hundreds of records. Besides searching (the box
 *   above the tabs), the owner narrows a tab by a tag the Director used, shown as chips so
 *   nothing has to be recalled or typed exactly. Active filters are shown and cleared in one
 *   click, and the result count is announced politely so a screen-reader user hears that a
 *   change moved the list. When the project's memory is still in files (search unavailable) the
 *   search words narrow this list too, and "Clear filters" clears them with the rest.
 *
 * Exports: MemoryToolbar.
 * Depends on: lucide-react, types/memory.types.
 */

import { X } from 'lucide-react';
import type { MemoryFilter } from '#/types/memory.types.js';

export function MemoryToolbar(props: {
  filter: MemoryFilter;
  tags: readonly string[];
  shown: number;
  total: number;
  onChange: (next: MemoryFilter) => void;
}) {
  const { filter } = props;
  const narrowed = filter.text !== '' || filter.tags.length > 0 || filter.activeOnly;

  const toggleTag = (tag: string): void =>
    props.onChange({
      ...filter,
      tags: filter.tags.includes(tag)
        ? filter.tags.filter((t) => t !== tag)
        : [...filter.tags, tag],
    });

  return (
    <div className="grid gap-3">
      {props.tags.length > 0 || filter.tab === 'decisions' ? (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filters"
        >
          {props.tags.map((tag) => {
            const on = filter.tags.includes(tag);

            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTag(tag)}
                className={`min-h-8 rounded-md border px-2 font-data text-xs transition-colors duration-150 ${
                  on
                    ? 'border-signal bg-signal-soft text-signal'
                    : 'border-line text-muted hover:bg-hover'
                }`}
              >
                {tag}
              </button>
            );
          })}
          {filter.tab === 'decisions' ? (
            <label className="ml-auto flex min-h-8 items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={filter.activeOnly}
                onChange={(event) =>
                  props.onChange({ ...filter, activeOnly: event.target.checked })
                }
                className="size-4 accent-[var(--signal)]"
              />
              Hide superseded
            </label>
          ) : null}
        </div>
      ) : null}

      <p aria-live="polite" className="flex items-center gap-2 text-xs text-muted">
        {narrowed ? `${props.shown} of ${props.total} shown` : `${props.total} records`}
        {narrowed ? (
          <button
            type="button"
            onClick={() =>
              props.onChange({ ...filter, text: '', tags: [], activeOnly: false })
            }
            className="inline-flex min-h-6 items-center gap-1 rounded-md px-1.5 font-medium text-signal hover:bg-hover"
          >
            <X aria-hidden="true" className="size-3" />
            Clear filters
          </button>
        ) : null}
      </p>
    </div>
  );
}
