/**
 * TriggerAdapter port — one ticket source (chat, GitHub issues, later cron or webhooks).
 *
 * Why: work reaches the Director from several places, and each speaks its own shape: a chat
 *   message, a GitHub issue payload, a poll result. The Director must treat them all as one
 *   `IntakeEvent` and must never learn a source's quirks, or every new source would be an
 *   engine edit. An adapter owns exactly one source: it turns that source's raw, untrusted
 *   payload into a validated event (and, for sources that cannot push, fetches what is new).
 *   Fail closed: a payload that does not parse is rejected, never half-accepted, and an event
 *   that claims another adapter's source is a bug in the adapter, not a thing to forward
 *   (director-core.md §7, d-0002).
 *
 * Exports: TriggerAdapter, TriggerCapabilities.
 * Depends on: schemas/intake (types only). Types only.
 */

import type { IntakeEvent, IntakeSource } from '#/schemas/intake.js';

/** How events arrive: pushed to `POST /intake`, pulled by `poll`, or both. */
export interface TriggerCapabilities {
  /** The source calls us (`POST /intake`); `normalise` is the boundary for its payloads. */
  readonly push: boolean;
  /** The source must be asked; `poll` exists and the server calls it on an interval. */
  readonly poll: boolean;
}

/** One ticket source behind the intake door. */
export interface TriggerAdapter {
  /** Stable adapter id (`chat`, later `github-issues`); one adapter per id in a registry. */
  readonly id: string;
  /** The `IntakeEvent.source` every event of this adapter carries; the registry routes on it. */
  readonly source: IntakeSource;
  capabilities(): TriggerCapabilities;
  /**
   * Raw source payload to a validated `IntakeEvent` of this adapter's `source`. Pure and
   * deterministic: delivering the same payload twice yields the same `source` and
   * `dedupe_key`, so the engine's dedupe makes redelivery harmless. Throws a `ZodError`
   * (parse at the boundary) when the payload is not acceptable; never returns a partial event.
   */
  normalise(raw: unknown): IntakeEvent;
  /**
   * Events received at or after `since` (an ISO timestamp from a previous event's
   * `received_at`, or `null` on the first call). Overlap is allowed: the engine dedupes.
   * Present only when `capabilities().poll`.
   */
  poll?(since: string | null): Promise<IntakeEvent[]>;
}
