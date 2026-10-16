/**
 * Picker model: the pure rules behind the Picker's list.
 *
 * Why: the Picker's behaviour (which rows a search keeps, how rows fall under headings, which
 *   row an arrow key lands on, what a typed letter jumps to, what the trigger says) is easy to
 *   get subtly wrong and hard to see through the DOM. Keeping it as plain functions makes the
 *   rules testable on their own and keeps the component to wiring. A disabled item is never
 *   a target for keys or typeahead, so keyboard users cannot land on a choice they cannot make.
 *
 * Exports: filterItems(), groupItems(), enabledValues(), stepActive(), matchTypeahead(),
 *   toggleValue(), triggerSummary().
 * Depends on: types/picker.types. No IO.
 */

import type { PickerItem, PickerSection } from '#/types/picker.types.js';

/** Items whose label, description or value contains the query, ignoring case and edges. */
export function filterItems(
  items: readonly PickerItem[],
  query: string,
): readonly PickerItem[] {
  const needle = query.trim().toLowerCase();

  if (needle === '') {
    return items;
  }

  return items.filter((item) =>
    [item.label, item.description ?? '', item.value].some((text) =>
      text.toLowerCase().includes(needle),
    ),
  );
}

/** Groups in order of first appearance; ungrouped items keep their place as one section. */
export function groupItems(items: readonly PickerItem[]): readonly PickerSection[] {
  const sections: { group: string | undefined; items: PickerItem[] }[] = [];

  for (const item of items) {
    const section = sections.find((s) => s.group === item.group);

    if (section) {
      section.items.push(item);
    } else {
      sections.push({ group: item.group, items: [item] });
    }
  }

  return sections;
}

/** Values of the rows keys can land on, in the order they are shown (sections flattened). */
export function enabledValues(sections: readonly PickerSection[]): readonly string[] {
  return sections.flatMap((s) => s.items.filter((i) => !i.disabled).map((i) => i.value));
}

/** The enabled value `by` steps from `current` (clamped at the ends); `current` null starts at an end. */
export function stepActive(
  values: readonly string[],
  current: string | null,
  by: 1 | -1 | 'first' | 'last',
): string | null {
  if (values.length === 0) {
    return null;
  }

  if (by === 'first') {
    return values[0] ?? null;
  }

  if (by === 'last') {
    return values[values.length - 1] ?? null;
  }

  const at = current === null ? -1 : values.indexOf(current);

  if (at === -1) {
    return values[by === 1 ? 0 : values.length - 1] ?? null;
  }

  return values[Math.min(values.length - 1, Math.max(0, at + by))] ?? null;
}

/**
 * The enabled item a typed prefix jumps to. A repeated single letter ("ccc") cycles through
 * the items starting with it, as native selects do.
 */
export function matchTypeahead(
  sections: readonly PickerSection[],
  current: string | null,
  typed: string,
): string | null {
  const flat = sections.flatMap((s) => s.items).filter((i) => !i.disabled);
  const needle = typed.toLowerCase();
  const cycling = needle.length > 1 && [...needle].every((ch) => ch === needle[0]);
  const prefix = cycling ? (needle[0] ?? '') : needle;
  const hits = flat.filter((i) => i.label.toLowerCase().startsWith(prefix));

  if (hits.length === 0) {
    return null;
  }

  if (cycling || needle.length === 1) {
    const after = hits.findIndex((i) => i.value === current);

    return (hits[(after + 1) % hits.length] ?? hits[0])?.value ?? null;
  }

  return hits[0]?.value ?? null;
}

/** The list with `value` added, or removed when it is already in. */
export function toggleValue(list: readonly string[], value: string): readonly string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * What the trigger says: nothing chosen gives null (the caller shows the placeholder), one
 * choice shows its label (or the raw value if the list no longer has it), several show a count.
 */
export function triggerSummary(
  items: readonly PickerItem[],
  chosen: readonly string[],
): { text: string; item: PickerItem | undefined } | null {
  if (chosen.length === 0) {
    return null;
  }

  if (chosen.length > 1) {
    return { text: `${chosen.length} selected`, item: undefined };
  }

  const item = items.find((i) => i.value === chosen[0]);

  return { text: item?.label ?? (chosen[0] as string), item };
}
