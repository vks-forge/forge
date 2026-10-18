/**
 * The research settings as field descriptors, and how their errors are found.
 *
 * Why: the address and the page timeout are ordinary company-setting fields, so they are
 *   described as data like the Limits fields: the label, a hint saying what happens, the unit
 *   the owner thinks in (seconds for a value stored in milliseconds). The host lists are
 *   edited as text lists and their schema errors name an entry (`research.fetch.allow_hosts.2`),
 *   so a helper finds the first problem anywhere under a path and the page can put one
 *   sentence under the right box, and know whether the settings are fit to test.
 *
 * Exports: RESEARCH_URL_FIELD, RESEARCH_FETCH_FIELDS, firstErrorUnder().
 * Depends on: types/settings-fields.types. Pure data.
 */

import type { FieldErrors, FieldSpec } from '#/types/settings-fields.types.js';

export const RESEARCH_URL_FIELD: readonly FieldSpec[] = [
  {
    kind: 'text',
    path: 'research.searxng.base_url',
    label: 'SearXNG address',
    hint: 'Where SearXNG listens, such as http://localhost:8888. It must have the JSON format enabled.',
  },
];

export const RESEARCH_FETCH_FIELDS: readonly FieldSpec[] = [
  {
    kind: 'number',
    path: 'research.fetch.timeout_ms',
    label: 'Give up on a page after',
    unit: 's',
    scale: 1000,
    hint: 'From 1 to 30 seconds. A slow page is skipped, not waited for.',
  },
];

/** The first error at `path` or anywhere under it (`path.0`, `path.base_url`), or undefined. */
export function firstErrorUnder(errors: FieldErrors, path: string): string | undefined {
  const key = Object.keys(errors).find((k) => k === path || k.startsWith(`${path}.`));

  return key === undefined ? undefined : errors[key];
}
