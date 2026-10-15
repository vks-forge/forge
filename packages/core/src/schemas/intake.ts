/**
 * Intake event schema — the normalized shape every trigger emits.
 *
 * Why: work reaches the Director from chat now and from webhooks, cron, telemetry or bug
 *   reports later, and every source redelivers, retries and races. Normalizing them into
 *   one envelope lets the Director dedupe, quarantine and map events without knowing any
 *   source's specifics, so a new trigger never touches the engine. `dedupe_key` is
 *   unique only within a source, so the idempotency key combines both; without it a
 *   redelivered message would create duplicate tickets and duplicate spend. The raw
 *   `payload` is untrusted user or external text and is never forwarded to a Worker
 *   verbatim (director-core.md §7, d-0002).
 *
 * Exports: IntakeSource, IntakeKind, IntakeActor, IntakeAuthor, IntakeEvent, StoredIntakeEvent,
 *   intakeIdempotencyKey().
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** Where an event came from. Open enum: new emitters (webhooks, schedulers, CI) add a value without touching the envelope. */
export const IntakeSource = z.enum([
  'chat',
  'webhook',
  'cron',
  'telemetry',
  'bug_report',
  'github_issue',
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

/**
 * Who wrote the text, as the source knows it: a Forge user, or a GitHub login. The allow-list
 * of who may file work from GitHub (d-0112) reads this; `actor` stays who caused the event.
 */
export const IntakeAuthor = z.object({
  kind: z.enum(['user', 'github']),
  login: z.string().min(1).optional(),
});
export type IntakeAuthor = z.infer<typeof IntakeAuthor>;

/** A raw intake event; `payload` is quarantined and never forwarded verbatim. */
export const IntakeEvent = z.object({
  source: IntakeSource,
  kind: IntakeKind,
  dedupe_key: z.string().min(1),
  actor: IntakeActor,
  author: IntakeAuthor.optional(),
  project: z.string().min(1),
  // Raw and quarantined: never forwarded to a Worker verbatim.
  payload: z.unknown(),
  received_at: z.iso.datetime(),
});
export type IntakeEvent = z.infer<typeof IntakeEvent>;

/**
 * An intake event as stored: the database id (what `tickets.created_by_intake` points at)
 * and the ticket the Director mapped it to, once it has. A redelivery returns the first
 * stored copy, so the id identifies the event, not the delivery.
 */
export const StoredIntakeEvent = IntakeEvent.extend({
  id: z.number().int().positive(),
  ticket_id: z.string().min(1).optional(),
});
export type StoredIntakeEvent = z.infer<typeof StoredIntakeEvent>;

/** Stable per-source idempotency key, since `dedupe_key` is only unique within a source. */
export function intakeIdempotencyKey(
  event: Pick<IntakeEvent, 'source' | 'dedupe_key'>,
): string {
  return `${event.source}:${event.dedupe_key}`;
}
