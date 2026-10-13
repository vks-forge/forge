/**
 * The `claude -p` command line for one Director step.
 *
 * Why: a Director step is pure judgement: it must not read files, run tools, load the
 *   user's settings or hooks, save a session, or stop to ask a permission, and it must stop
 *   spending at a hard cap. Each of those is one flag, verified in `claude --help` of
 *   2.1.296 (probe 7 measures them live). Keeping the list in one function means the
 *   isolation cannot drift between callers. The schema travels as `--json-schema` so the
 *   harness holds the model to the same shape the Director parses against.
 *
 * Exports: jsonSchemaArg(), buildDirectorArgs().
 * Depends on: zod, @forge/core (StepOptions, InvalidInputError). No IO.
 */

import { InvalidInputError } from '@forge/core';
import type { StepOptions } from '@forge/core';
import { z } from 'zod';
import type { ZodType } from 'zod';

/** JSON Schema (draft-07, no `$schema` key) of `schema` as a string. Throws InvalidInputError if it has no JSON form. */
export function jsonSchemaArg(schema: ZodType): string {
  try {
    const json = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
    delete json['$schema'];
    return JSON.stringify(json);
  } catch (e) {
    throw new InvalidInputError(
      `step output schema cannot be expressed as JSON Schema: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** Argument list (no shell, prompt on stdin) for one step. */
export function buildDirectorArgs(schemaJson: string, opts: StepOptions): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    schemaJson,
    '--tools',
    '',
    '--setting-sources',
    '',
    '--no-session-persistence',
    '--permission-prompts',
    'none',
    '--max-budget-usd',
    String(opts.budgetUsd),
    '--model',
    opts.model,
  ];
}
