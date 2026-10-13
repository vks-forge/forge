/**
 * In-memory interaction and intake-event repositories.
 *
 * Why: both are decided by a race on a single row, and the engine's tests must see the same
 *   winner SQLite gives. An interaction is resolved by compare-and-swap (`answer` and
 *   `expire` only from `pending`, `expire` only once due), so a human and a timeout cannot
 *   both win; an intake event is deduped on (source, dedupe_key) and a redelivery gets the
 *   first stored copy, with its id and the ticket it already became, back
 *   (director-core.md §3, §7, §8).
 *
 * Exports: memoryInteractions(), memoryIntakeEvents().
 * Depends on: @forge/core, adapters/memory/rows, shared/json, shared/patches,
 *   types/memory-state.types. No IO.
 */

import {
  IntakeEvent,
  Interaction,
  StoredIntakeEvent,
  UnknownForgeError,
} from '@forge/core';
import type { IntakeEventRepository, InteractionRepository } from '@forge/core';
import { insertUnique, withoutUndefined } from '#/adapters/memory/rows.js';
import { normaliseJson } from '#/shared/json.js';
import { parseInteractionPatch } from '#/shared/patches.js';
import type { MemoryState } from '#/types/memory-state.types.js';

const byAsked = (a: Interaction, b: Interaction): number =>
  a.asked_at.localeCompare(b.asked_at);

export function memoryInteractions(state: MemoryState): InteractionRepository {
  return {
    async get(id) {
      const i = state.interactions.get(id);
      return i ? structuredClone(i) : null;
    },
    async listPending() {
      return [...state.interactions.values()]
        .filter((i) => i.status === 'pending')
        .sort(byAsked)
        .map((i) => structuredClone(i));
    },
    async listByTicket(ticketId) {
      return [...state.interactions.values()]
        .filter((i) => i.ticket_id === ticketId)
        .sort(byAsked)
        .map((i) => structuredClone(i));
    },
    async insert(interaction) {
      const i = Interaction.parse(interaction);
      insertUnique(state.interactions, i.id, i, 'interaction');
    },
    async update(id, patch) {
      const current = state.interactions.get(id);
      if (!current) throw new UnknownForgeError(`Interaction not found: ${id}`);
      state.interactions.set(
        id,
        withoutUndefined(
          Interaction.parse({ ...current, ...parseInteractionPatch(patch) }),
        ),
      );
    },
    async answer(id, answer, at) {
      const current = state.interactions.get(id);
      if (current?.status !== 'pending') return false;
      state.interactions.set(
        id,
        Interaction.parse({
          ...current,
          status: 'answered',
          answer: normaliseJson(answer),
          answered_at: at,
        }),
      );
      return true;
    },
    async expire(id, at) {
      const current = state.interactions.get(id);
      if (current?.status !== 'pending' || current.timeout_at > at) return false;
      state.interactions.set(id, { ...current, status: 'timed_out' });
      return true;
    },
  };
}

export function memoryIntakeEvents(state: MemoryState): IntakeEventRepository {
  return {
    async insertIfNew(event) {
      const e = IntakeEvent.parse(event);
      const key = JSON.stringify([e.source, e.dedupe_key]);
      const existing = state.intake.get(key);
      if (existing) return { inserted: false, event: structuredClone(existing) };
      // JSON-normalise like the payload_json column, so undefined reads back as null.
      const stored = StoredIntakeEvent.parse({
        ...e,
        payload: normaliseJson(e.payload),
        id: state.intakeSeq + 1,
      });
      state.intakeSeq = stored.id;
      state.intake.set(key, stored);
      return { inserted: true, event: structuredClone(stored) };
    },
    async markTicket(id, ticketId) {
      const stored = [...state.intake.values()].find((e) => e.id === id);
      if (!stored || stored.ticket_id !== undefined) return false;
      stored.ticket_id = ticketId;
      return true;
    },
  };
}
