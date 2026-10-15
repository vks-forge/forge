/**
 * MemoryToolbar: search, tag filter and (on Decisions) hide-superseded.
 *
 * Why: a project that has run for months has hundreds of records. The owner narrows by
 *   words they remember (searches id, statement and tags) or by a tag the Director used, both
 *   visible as chips so nothing has to be recalled or typed exactly. Active filters are shown
 *   and cleared in one click, and the result count is announced politely so a screen-reader
 *   user hears that typing changed the list. `/` jumps to the search box, the usual shortcut.
 *
 * Exports: MemoryToolbar.
 * Depends on: react, lucide-react, components/ui/{button,field}, types/memory.types.
 */

import { Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { INPUT_CLASS } from '#/components/ui/field.js';
import type { MemoryFilter } from '#/types/memory.types.js';

export function MemoryToolbar(props: {
  filter: MemoryFilter;
  tags: readonly string[];
  shown: number;
  total: number;
  onChange: (next: MemoryFilter) => void;
}) {
  const { filter } = props;
  const search = useRef<HTMLInputElement>(null);
  const narrowed = filter.text !== '' || filter.tags.length > 0 || filter.activeOnly;

  useEffect(() => {
    const focus = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement;
      const typing = /^(input|textarea|select)$/i.test(target.tagName);
      if (event.key === '/' && !typing && !target.isContentEditable) {
        event.preventDefault();
        search.current?.focus();
      }
    };

    window.addEventListener('keydown', focus);

    return () => window.removeEventListener('keydown', focus);
  }, []);

  const toggleTag = (tag: string): void =>
    props.onChange({
      ...filter,
      tags: filter.tags.includes(tag)
        ? filter.tags.filter((t) => t !== tag)
        : [...filter.tags, tag],
    });

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
        />
        <input
          ref={search}
          type="search"
          aria-label="Search memory"
          placeholder="Search by words, id or tag (press /)"
          value={filter.text}
          onChange={(event) => props.onChange({ ...filter, text: event.target.value })}
          className={`${INPUT_CLASS} pl-9`}
        />
      </div>

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
