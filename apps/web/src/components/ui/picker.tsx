/**
 * Picker: the one dropdown for choosing from a list (it replaces the native select).
 *
 * Why: a native select cannot show an icon, a description, a badge or the reason an option is
 *   unavailable, cannot be searched, and looks different on every OS and in dark mode, so
 *   board filters, the card type, settings and onboarding all looked unlike the rest of the
 *   control room (d-0154). The Picker is a button that opens an elevated listbox with the same
 *   keyboard contract as a native select (arrows, Home/End, Enter/Space, typeahead, Escape
 *   back to the trigger) plus an optional search box for long lists and a multiple mode. It
 *   speaks ARIA combobox/listbox with `aria-activedescendant`, so screen readers announce the
 *   active option while focus stays in one place. Disabled options stay visible with their
 *   reason, never silently missing.
 *
 * Exports: Picker.
 * Depends on: react, @radix-ui/react-popover, lucide-react, domain/picker-model,
 *   components/ui/picker-list, types/picker.types, theme/app.css (picker-in).
 */

import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, LoaderCircle, Search } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { PickerList, PickerNotice, optionId } from '#/components/ui/picker-list.js';
import {
  enabledValues,
  filterItems,
  groupItems,
  matchTypeahead,
  stepActive,
  toggleValue,
  triggerSummary,
} from '#/domain/picker-model.js';
import type { PickerProps } from '#/types/picker.types.js';

const TYPEAHEAD_RESET_MS = 600;
const AUTO_SEARCH_OVER = 8;

export function Picker(props: PickerProps) {
  const {
    items,
    placeholder = 'Choose',
    size = 'md',
    disabled = false,
    loading = false,
    error,
    emptyText = 'Nothing to choose from',
  } = props;

  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const typed = useRef({ text: '', at: 0 });
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const multiple = props.multiple === true;
  const chosen = useMemo<readonly string[]>(
    () => (props.multiple ? props.value : props.value === '' ? [] : [props.value]),
    [props.multiple, props.value],
  );

  const searchable = props.searchable ?? items.length > AUTO_SEARCH_OVER;
  const sections = useMemo(() => groupItems(filterItems(items, query)), [items, query]);
  const order = useMemo(() => enabledValues(sections), [sections]);
  const summary = triggerSummary(items, chosen);
  const invalid = error !== undefined && error !== false;
  const activeId = active === null ? undefined : optionId(listId, active);
  const count = sections.reduce((n, s) => n + s.items.length, 0);

  function handleOpen(next: boolean): void {
    setOpen(next);

    if (next) {
      const all = enabledValues(groupItems(items));

      setQuery('');
      typed.current = { text: '', at: 0 };
      setActive(chosen.find((v) => all.includes(v)) ?? all[0] ?? null);
    }
  }

  function pick(value: string): void {
    if (props.multiple) {
      props.onChange(toggleValue(props.value, value));

      return;
    }

    props.onChange(value);
    setOpen(false);
  }

  function move(next: string | null): void {
    if (next !== null) {
      setActive(next);
      document
        .getElementById(optionId(listId, next))
        ?.scrollIntoView({ block: 'nearest' });
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const inSearch = event.target === searchRef.current;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(stepActive(order, active, event.key === 'ArrowDown' ? 1 : -1));
    } else if ((event.key === 'Home' || event.key === 'End') && !inSearch) {
      event.preventDefault();
      move(stepActive(order, active, event.key === 'Home' ? 'first' : 'last'));
    } else if (event.key === 'Enter' || (event.key === ' ' && !inSearch)) {
      event.preventDefault();

      if (active !== null) {
        pick(active);
      }
    } else if (event.key === 'Tab') {
      setOpen(false);
    } else if (
      !searchable &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      const text =
        now - typed.current.at > TYPEAHEAD_RESET_MS
          ? event.key
          : typed.current.text + event.key;

      typed.current = { text, at: now };
      move(matchTypeahead(sections, active, text));
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          role="combobox"
          id={props.id}
          aria-haspopup="listbox"
          aria-label={props.label}
          aria-labelledby={props['aria-labelledby']}
          aria-describedby={props['aria-describedby']}
          aria-invalid={invalid || undefined}
          aria-busy={loading || undefined}
          disabled={disabled}
          className={`group flex w-full items-center gap-2 rounded-lg border bg-surface px-3 text-left text-fg transition-[border-color,background-color] duration-150 hover:border-faint disabled:cursor-not-allowed disabled:bg-hover disabled:text-muted disabled:hover:border-line ${
            invalid ? 'border-danger' : 'border-line'
          } ${size === 'sm' ? 'min-h-8 text-xs' : 'min-h-9 text-sm'} ${props.className ?? ''}`}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              handleOpen(true);
            }
          }}
        >
          {summary?.item?.icon ? (
            <span aria-hidden="true" className="shrink-0 text-muted [&>svg]:size-4">
              {summary.item.icon}
            </span>
          ) : null}
          <span className={`min-w-0 flex-1 truncate ${summary ? '' : 'text-faint'}`}>
            {summary?.text ?? placeholder}
          </span>
          {loading ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 shrink-0 animate-spin text-muted"
            />
          ) : (
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted transition-transform duration-150 group-aria-expanded:rotate-180"
            />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="presentation"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (searchable ? searchRef.current : listRef.current)?.focus();
          }}
          className="z-[70] max-w-[min(24rem,calc(100vw-1rem))] min-w-(--radix-popover-trigger-width) origin-(--radix-popover-content-transform-origin) rounded-xl border border-line bg-surface p-1.5 shadow-float animate-[picker-in_120ms_ease-out]"
        >
          {searchable ? (
            <div className="relative mb-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
              />
              <input
                ref={searchRef}
                type="search"
                role="searchbox"
                aria-label="Search options"
                aria-controls={listId}
                aria-activedescendant={activeId}
                autoComplete="off"
                spellCheck={false}
                placeholder="Search"
                value={query}
                onChange={(event) => {
                  const next = filterItems(items, event.target.value);

                  setQuery(event.target.value);
                  setActive(enabledValues(groupItems(next))[0] ?? null);
                }}
                className="min-h-9 w-full rounded-lg border border-line bg-bg pl-8 pr-2 text-sm text-fg placeholder:text-faint"
              />
            </div>
          ) : null}
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={searchable ? undefined : -1}
            aria-label={props.label}
            aria-labelledby={props['aria-labelledby']}
            aria-multiselectable={multiple || undefined}
            aria-activedescendant={searchable ? undefined : activeId}
            className="scroll-area max-h-72 overflow-y-auto outline-none"
          >
            <PickerList
              listId={listId}
              sections={sections}
              selected={chosen}
              active={active}
              multiple={multiple}
              onPick={pick}
              onHover={setActive}
            />
          </div>
          <PickerNotice
            count={count}
            loading={loading}
            failure={typeof error === 'string' ? error : undefined}
            emptyText={emptyText}
            searching={query.trim() !== ''}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
