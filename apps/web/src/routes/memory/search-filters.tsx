/**
 * SearchFilters: kind, status and tag chips and the "Include superseded" switch for a search.
 *
 * Why: a search for "pnpm" may find a decision, a rejected approach and an old replaced
 *   decision, and the owner usually wants one of them. The choices are shown as chips, not
 *   typed filters, so nothing has to be recalled (heuristic: recognition over recall); each chip
 *   says whether it is on with `aria-pressed` and a filled look. Replaced decisions stay hidden
 *   until asked for, because the active one is what binds the Director. Tags come from the
 *   project's own records, most used first.
 *
 * Exports: SearchFilters.
 * Depends on: react, components/ui/field, domain/memory-search-params, domain/memory-record-copy,
 *   types/memory.types.
 */

import { X } from 'lucide-react';
import type { MemoryKind, MemoryStatus } from '@forge/core';
import { Switch } from '#/components/ui/field.js';
import { KIND_LABEL } from '#/domain/memory-record-copy.js';
import {
  SEARCH_KINDS,
  SEARCH_STATUSES,
  hasChipFilters,
} from '#/domain/memory-search-params.js';
import type { MemorySearchState } from '#/types/memory.types.js';

const STATUS_LABEL: Readonly<Record<MemoryStatus, string>> = {
  active: 'Active',
  pending: 'Needs your answer',
  rejected: 'Rejected',
  superseded: 'Superseded',
};

function Chip(props: {
  label: string;
  on: boolean;
  mono?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.on}
      onClick={props.onToggle}
      className={`min-h-8 rounded-md border px-2 text-xs transition-colors duration-150 ${
        props.mono ? 'font-data' : ''
      } ${
        props.on
          ? 'border-signal bg-signal-soft text-signal'
          : 'border-line text-muted hover:bg-hover'
      }`}
    >
      {props.label}
    </button>
  );
}

function toggled<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function SearchFilters(props: {
  state: MemorySearchState;
  tags: readonly string[];
  onChange: (next: MemorySearchState) => void;
}) {
  const { state } = props;

  return (
    <div className="grid gap-3">
      <div role="group" aria-label="Kind" className="flex flex-wrap items-center gap-2">
        <span className="w-14 text-xs text-muted">Kind</span>
        {SEARCH_KINDS.map((kind: MemoryKind) => (
          <Chip
            key={kind}
            label={KIND_LABEL[kind]}
            on={state.kinds.includes(kind)}
            onToggle={() =>
              props.onChange({ ...state, kinds: toggled(state.kinds, kind) })
            }
          />
        ))}
      </div>
      <div role="group" aria-label="Status" className="flex flex-wrap items-center gap-2">
        <span className="w-14 text-xs text-muted">Status</span>
        {SEARCH_STATUSES.map((status) => (
          <Chip
            key={status}
            label={STATUS_LABEL[status]}
            on={state.statuses.includes(status)}
            onToggle={() =>
              props.onChange({ ...state, statuses: toggled(state.statuses, status) })
            }
          />
        ))}
      </div>
      {props.tags.length > 0 ? (
        <div role="group" aria-label="Tags" className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-xs text-muted">Tag</span>
          {props.tags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              mono
              on={state.tags.includes(tag)}
              onToggle={() =>
                props.onChange({ ...state, tags: toggled(state.tags, tag) })
              }
            />
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={state.superseded}
            label="Include superseded"
            onChange={(superseded) => props.onChange({ ...state, superseded })}
          />
          <span className="text-xs text-muted">Include superseded</span>
        </div>
        {hasChipFilters(state) ? (
          <button
            type="button"
            onClick={() =>
              props.onChange({
                ...state,
                kinds: [],
                statuses: [],
                tags: [],
                superseded: false,
              })
            }
            className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-signal hover:bg-hover"
          >
            <X aria-hidden="true" className="size-3" />
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
