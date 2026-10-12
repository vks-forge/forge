/**
 * Intake event schema — the normalized shape every trigger emits.
 *
 * Why: triggers are pluggable but v1 only produces `chat` (d-0002); the Director
 *   dedupes and quarantines on this one shape before anything reaches a Worker
 *   (director-core.md §7).
 *
 * Exports: IntakeSource, IntakeKind, IntakeActor, IntakeEvent, intakeIdempotencyKey().
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** Where an event came from; open to later emitters, only `chat` is produced in M0. */
export const IntakeSource = z.enum([
  'chat',
  'webhook',
  'cron',
  'telemetry',
  'bug_report',
]);
export type IntakeSource = z.infer<typeof IntakeSource>;

/** What the event asks for: a new request, a reply to a question, or a command. */
export const IntakeKind = z.enum(['new_request', 'reply', 'command']);
export type IntakeKind = z.infer<typeof IntakeKind>;

/** Who caused the event. */
export const IntakeActor = z.object({
  type: z.enum(['user', 'system', 'external']),
  id: z.string().min(1),
});

/** A raw intake event; `payload` is quarantined and never forwarded verbatim. */
export const IntakeEvent = z.object({
  source: IntakeSource,
  kind: IntakeKind,
  dedupe_key: z.string().min(1),
  actor: IntakeActor,
  project: z.string().min(1),
  // Raw and quarantined: never forwarded to a Worker verbatim.
  payload: z.unknown(),
  received_at: z.iso.datetime(),
});
export type IntakeEvent = z.infer<typeof IntakeEvent>;

/** Stable per-source idempotency key, since `dedupe_key` is only unique within a source. */
export function intakeIdempotencyKey(
  event: Pick<IntakeEvent, 'source' | 'dedupe_key'>,
): string {
  return `${event.source}:${event.dedupe_key}`;
}
