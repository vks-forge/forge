/**
 * PickerList: the rows of an open Picker (headings and options) and its empty/loading/error notice.
 *
 * Why: the popover body is where choosing happens, so each row has to say everything the
 *   user needs without colour alone: a checkmark for chosen (a checkbox in multiple mode), a
 *   tinted row for the one the keyboard is on, dimmed text plus the reason for an item that
 *   cannot be chosen right now, and plain sentences when there is nothing to show or the
 *   list is still loading. Rows keep focus where it is (mouse down is cancelled) so keyboard
 *   control continues after a click; the active row is exposed through `aria-activedescendant`
 *   on the owner, so options are never tab stops.
 *
 * Exports: PickerList, PickerNotice, optionId().
 * Depends on: react, lucide-react, types/picker.types.
 */

import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import type { PickerItem, PickerSection } from '#/types/picker.types.js';

/** DOM id of one option, derived so the owner can point `aria-activedescendant` at it. */
export function optionId(listId: string, value: string): string {
  return `${listId}-opt-${value.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

function Row(props: {
  item: PickerItem;
  listId: string;
  selected: boolean;
  active: boolean;
  multiple: boolean;
  onPick: (value: string) => void;
  onHover: (value: string) => void;
}) {
  const { item, listId, selected, active, multiple } = props;
  const id = optionId(listId, item.value);
  const second =
    item.disabled && item.disabledReason ? item.disabledReason : item.description;

  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={item.disabled || undefined}
      aria-labelledby={`${id}-label`}
      aria-describedby={second ? `${id}-note` : undefined}
      data-active={active || undefined}
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={() => (item.disabled ? undefined : props.onHover(item.value))}
      onClick={() => (item.disabled ? undefined : props.onPick(item.value))}
      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
        item.disabled ? 'cursor-not-allowed text-faint' : 'text-fg'
      } ${active ? 'bg-hover' : ''}`}
    >
      {multiple ? (
        <span
          aria-hidden="true"
          className={`grid size-4 shrink-0 place-items-center rounded-sm border ${
            selected ? 'border-signal bg-signal text-on-signal' : 'border-faint'
          }`}
        >
          {selected ? <Check className="size-3" /> : null}
        </span>
      ) : null}
      {item.icon ? (
        <span aria-hidden="true" className="shrink-0 text-muted [&>svg]:size-4">
          {item.icon}
        </span>
      ) : null}
      <span className="grid min-w-0 flex-1">
        <span
          id={`${id}-label`}
          className={`truncate ${selected && !multiple ? 'font-medium' : ''}`}
        >
          {item.label}
        </span>
        {second ? (
          <span id={`${id}-note`} className="truncate text-xs text-muted">
            {second}
          </span>
        ) : null}
      </span>
      {item.badge ? (
        <span className="shrink-0 rounded-md bg-hover px-1.5 py-0.5 text-xs text-muted">
          {item.badge}
        </span>
      ) : null}
      {!multiple && selected ? (
        <Check aria-hidden="true" className="size-4 shrink-0 text-signal" />
      ) : null}
    </div>
  );
}

/** The sentence shown beside an empty listbox: loading, a load failure, no matches or nothing to pick. */
export function PickerNotice(props: {
  count: number;
  loading: boolean;
  /** Message shown when the list failed to load and has no items. */
  failure: string | undefined;
  emptyText: string;
  searching: boolean;
}) {
  if (props.count > 0) {
    return null;
  }

  if (props.loading) {
    return (
      <p role="status" className="flex items-center gap-2 px-2.5 py-3 text-sm text-muted">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading
      </p>
    );
  }

  if (props.failure) {
    return (
      <p role="alert" className="flex items-center gap-2 px-2.5 py-3 text-sm text-danger">
        <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
        {props.failure}
      </p>
    );
  }

  return (
    <p role="status" className="px-2.5 py-3 text-sm text-muted">
      {props.searching ? 'No matches' : props.emptyText}
    </p>
  );
}

export function PickerList(props: {
  listId: string;
  sections: readonly PickerSection[];
  selected: readonly string[];
  active: string | null;
  multiple: boolean;
  onPick: (value: string) => void;
  onHover: (value: string) => void;
}) {
  return props.sections.map((section, index) => {
    const headingId = `${props.listId}-g-${index}`;
    const rows = section.items.map((item) => (
      <Row
        key={item.value}
        item={item}
        listId={props.listId}
        selected={props.selected.includes(item.value)}
        active={props.active === item.value}
        multiple={props.multiple}
        onPick={props.onPick}
        onHover={props.onHover}
      />
    ));

    return (
      <div key={section.group ?? `ungrouped-${index}`}>
        {index > 0 ? <div role="separator" className="mx-1 my-1 h-px bg-line" /> : null}
        {section.group ? (
          <div role="group" aria-labelledby={headingId}>
            <div
              id={headingId}
              className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted"
            >
              {section.group}
            </div>
            {rows}
          </div>
        ) : (
          rows
        )}
      </div>
    );
  });
}
