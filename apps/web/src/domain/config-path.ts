/**
 * Dotted-path reads and writes on plain settings objects.
 *
 * Why: the Limits and General forms edit one settings document through dozens of fields, each
 *   named by a path such as `engine.run_budget.max_usd`. Reading, immutably writing and
 *   comparing by path keeps every field a one-line descriptor instead of a hand-wired handler,
 *   and lets server validation errors (which name a path) land under the field they belong to.
 *
 * Exports: isPlain(), getAt(), setAt(), sameValue().
 * Depends on: nothing. Pure.
 */

export function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value at `path` (`a.b.c`), or undefined when any step is missing. */
export function getAt(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const key of path.split('.')) {
    if (!isPlain(node)) {
      return undefined;
    }

    node = node[key];
  }

  return node;
}

/** A copy of `root` with `value` at `path`; objects along the path are copied, never mutated. */
export function setAt<T>(root: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  if (head === undefined || !isPlain(root)) {
    return root;
  }

  const next = rest.length === 0 ? value : setAt(root[head], rest.join('.'), value);

  return { ...root, [head]: next } as T;
}

/** Deep equality for settings values (plain objects, arrays, scalars; key order ignored). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }

  if (isPlain(a) && isPlain(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

    return [...keys].every((key) => sameValue(a[key], b[key]));
  }

  return Object.is(a, b);
}
