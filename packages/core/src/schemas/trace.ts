/**
 * TraceEntry schema — one line of the debug trace log.
 *
 * Why: when a card misbehaves the owner needs one readable story across card events, chats,
 *   Director steps, ticket transitions and Worker run events, which today live in different
 *   tables and are never joined (d-0163). Every source writes the same closed shape, so a
 *   line can be filtered by kind, card, ticket or run with a plain `grep`/`jq`, and the
 *   writer never has to guess what a payload is. `data` is deliberately free-form: the trace
 *   keeps full content (prompts, raw model output, tool inputs) and a schema for it would
 *   only drop what the owner is looking for.
 *
 * Exports: TRACE_KINDS, TraceKind, TRACE_ACTORS, TraceActor, TRACE_LEVELS, TraceLevel,
 *   TraceInput, TraceEntry.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

export const TRACE_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export const TraceLevel = z.enum(TRACE_LEVELS);
export type TraceLevel = z.infer<typeof TraceLevel>;

export const TRACE_KINDS = [
  'http',
  'card',
  'card_event',
  'chat',
  'ticket',
  'transition',
  'interaction',
  'director_step',
  'run',
  'run_event',
  'tool',
  'gate',
  'git',
  'config',
  'engine',
  'error',
] as const;
export const TraceKind = z.enum(TRACE_KINDS);
export type TraceKind = z.infer<typeof TraceKind>;

export const TRACE_ACTORS = ['owner', 'director', 'worker', 'engine', 'server'] as const;
export const TraceActor = z.enum(TRACE_ACTORS);
export type TraceActor = z.infer<typeof TraceActor>;

/** What a source hands the sink; the sink adds `ts` and `seq`. */
export const TraceInput = z.object({
  level: TraceLevel,
  kind: TraceKind,
  project: z.string().optional(),
  card_id: z.string().optional(),
  ticket_id: z.string().optional(),
  run_id: z.string().optional(),
  /** Director step name (`triage`, `card_chat`, ...) for `director_step` entries. */
  step: z.string().optional(),
  actor: TraceActor,
  /** One readable line. */
  message: z.string(),
  /** The full payload, redacted before it is written. */
  data: z.unknown(),
});
export type TraceInput = z.infer<typeof TraceInput>;

export const TraceEntry = TraceInput.extend({
  /** ISO time the entry was emitted. */
  ts: z.string(),
  /** Per-process counter; orders entries that share a millisecond. */
  seq: z.number().int().nonnegative(),
});
export type TraceEntry = z.infer<typeof TraceEntry>;
