/**
 * Document diff: what changed between two saved versions of a settings document.
 *
 * Why: the history list and the "changed since you opened" screen both have to answer "what
 *   is different?" for people who do not read JSON. A project override is a small flat
 *   document, so a top-level key diff with a short readable value is enough, and it is the
 *   same answer in both places. Key order does not count as a change.
 *
 * Exports: diffDocs(), describeValue().
 * Depends on: types/project-settings.types. No IO.
 */

import type { DocChange } from '#/types/project-settings.types.js';

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Top-level keys added, changed or removed going from `before` to `after`, sorted by key. */
export function diffDocs(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): DocChange[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changes: DocChange[] = [];

  for (const key of keys) {
    const had = key in before;
    const has = key in after;
    if (had && has && !same(before[key], after[key])) {
      changes.push({ key, kind: 'changed', before: before[key], after: after[key] });
    } else if (!had && has) {
      changes.push({ key, kind: 'added', before: undefined, after: after[key] });
    } else if (had && !has) {
      changes.push({ key, kind: 'removed', before: before[key], after: undefined });
    }
  }

  return changes;
}

/** A value as one short line: checks as `role: command`, lists joined, objects as JSON. */
export function describeValue(value: unknown): string {
  if (value === undefined) {
    return 'inherited';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'none';
    }

    return value
      .map((item: unknown) =>
        item && typeof item === 'object' && 'command' in item
          ? `${String((item as { role?: unknown }).role)}: ${String((item as { command: unknown }).command)}`
          : String(item),
      )
      .join(', ');
  }

  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
