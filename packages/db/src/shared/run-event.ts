/**
 * Normalises a run event before it is stored, identically in every adapter.
 *
 * Why: `tool_call.input` and `tool_result.output` are free-form (`unknown`), and a
 *   harness may legitimately send none. JSON storage drops `undefined`, an in-memory
 *   store keeps it, so the same event would read back differently per backend and replay
 *   or comparison code would see two shapes. Every event is passed through a JSON
 *   round-trip (the form SQLite stores) and a missing tool input or output is written as
 *   `null`, so listByRun returns exactly what append returned on every backend.
 *
 * Exports: normaliseRunEvent().
 * Depends on: @forge/core (NewRunEvent type, InvalidInputError). No IO.
 */

import { InvalidInputError } from '@forge/core';
import type { NewRunEvent } from '@forge/core';

/** The event as it will be stored: JSON-clean, with undefined tool input/output as null. */
export function normaliseRunEvent(event: NewRunEvent): NewRunEvent {
  let plain: Record<string, unknown>;
  try {
    plain = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
  } catch (error) {
    throw new InvalidInputError('run event is not JSON-serialisable', { cause: error });
  }
  if (plain['type'] === 'tool_call' && plain['input'] === undefined)
    plain['input'] = null;
  if (plain['type'] === 'tool_result' && plain['output'] === undefined)
    plain['output'] = null;
  return plain as NewRunEvent;
}
