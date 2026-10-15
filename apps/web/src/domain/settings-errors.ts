/**
 * Turns schema problems on the settings draft into one plain sentence per field.
 *
 * Why: the draft is checked against core's `ForgeConfig` schema, the same rules the server
 *   applies, so a bad value is caught before the save. Raw schema messages ("Too small:
 *   expected number to be >=10000") mean nothing to the person who typed 5 into a field
 *   labelled in seconds. Each message is rewritten in the unit the field shows, and keyed by
 *   the field's dotted path so it appears right under the input.
 *
 * Exports: fieldErrors().
 * Depends on: types/settings-fields.types, zod (types). Pure.
 */

import type { z } from 'zod';
import type { FieldErrors, FieldSpec } from '#/types/settings-fields.types.js';

const shown = (value: unknown, spec: FieldSpec | undefined): string => {
  const scale = spec?.kind === 'number' ? (spec.scale ?? 1) : 1;
  const unit = spec?.kind === 'number' && spec.unit ? ` ${spec.unit}` : '';

  return `${Number(value) / scale}${unit}`;
};

function wording(issue: z.core.$ZodIssue, spec: FieldSpec | undefined): string {
  if (issue.code === 'invalid_type') {
    return issue.expected === 'int' ? 'Use a whole number.' : 'Enter a number.';
  }

  if (issue.code === 'too_small') {
    return issue.inclusive
      ? `Must be at least ${shown(issue.minimum, spec)}.`
      : `Must be more than ${shown(issue.minimum, spec)}.`;
  }

  if (issue.code === 'too_big') {
    return `Must be at most ${shown(issue.maximum, spec)}.`;
  }

  return issue.message;
}

/** First problem per field path; paths that no visible field owns still appear so nothing is silently blocked. */
export function fieldErrors(
  issues: readonly z.core.$ZodIssue[],
  specs: readonly FieldSpec[],
): FieldErrors {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.join('.');
    if (path !== '' && out[path] === undefined) {
      out[path] = wording(
        issue,
        specs.find((s) => s.path === path),
      );
    }
  }

  return out;
}
