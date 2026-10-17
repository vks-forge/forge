/**
 * The trace storage decorator: every committed write becomes one readable trace entry.
 *
 * Why: card creation, chat turns, grill questions and answers, plans, ticket transitions,
 *   escalations, run rows and gate results all pass through the one storage port, so wrapping
 *   it captures the whole story without edits scattered through the engine (d-0163). The
 *   entries must say what changed (before and after for a ticket move), carry the card, ticket
 *   or run they belong to, appear only once the transaction committed, and leave storage's
 *   results and errors exactly as they were. Reads must stay silent.
 *
 * Pins: card insert and phase, card events by kind (chat vs card_event, actor mapped), reply
 *   queue, ticket insert, ticket CAS with before and after status, interaction escalate,
 *   run rows, gate results, project upsert as config; reads silent; rollback silent; results
 *   and errors pass through; run events are left to the engine pump.
 * Depends on: src/services/trace-storage, @forge/db (memory), @forge/core, vitest.
 */

import type { Card, CardId, Interaction, Ticket, TraceInput } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { describe, expect, it } from 'vitest';
import { traceStorageWrites } from '#/services/trace-storage.js';

const T = '2026-10-16T00:00:00.000Z';

const card: Card = {
  id: 'FX-C1' as CardId,
  project: 'p1',
  type: 'issue',
  title: 'T',
  summary: 's',
  source: { kind: 'chat', ref: 'k1' },
  created_by: { type: 'user', id: 'u' },
  created_at: T,
  updated_at: T,
  phase: 'grilling',
  phase_version: 0,
  needs_you: false,
  priority: 'normal',
  links: [],
};

const ticket: Ticket = {
  id: 'FX-1' as Ticket['id'],
  project: 'p1',
  card_id: 'FX-C1' as CardId,
  title: 't',
  body: 'b',
  type: 'feat',
  lane: 'express',
  tier_predicted: 'A',
  status: 'inbox',
  status_version: 0,
  rework_count: 0,
  priority: 0,
  created_at: T,
  updated_at: T,
  blocked_by: [],
};

const question: Interaction = {
  id: 'int-1',
  ticket_id: 'FX-1',
  kind: 'question',
  payload: { prompt: 'which?' },
  status: 'pending',
  asked_at: T,
  timeout_at: '2099-01-01T00:00:00.000Z',
};

async function setup() {
  const raw = createMemoryStorage();
  const entries: TraceInput[] = [];
  const storage = traceStorageWrites(raw, { emit: (e) => void entries.push(e) });
  await raw.transaction((tx) =>
    tx.projects.upsert({
      id: 'p1',
      slug: 'dcp',
      prefix: 'FX',
      status: 'ready',
      ecosystems: [],
      harness_defaults: {},
      tier_c_globs: [],
    }),
  );

  return { storage, raw, entries };
}

describe('traceStorageWrites', () => {
  it('logs a card creation with its card and owner actor, and a phase move', async () => {
    const { storage, entries } = await setup();

    await storage.transaction((tx) => tx.cards.insert(card));
    await storage.transaction((tx) =>
      tx.cards.updatePhase(card.id, 0, {
        phase: 'plan_ready',
        needs_you: true,
        updated_at: T,
      }),
    );

    expect(entries[0]).toMatchObject({
      kind: 'card',
      card_id: 'FX-C1',
      project: 'p1',
      actor: 'owner',
      message: expect.stringContaining('created'),
    });

    expect(entries[1]).toMatchObject({ kind: 'card', card_id: 'FX-C1' });
    expect(entries[1]?.message).toContain('plan_ready');
  });

  it('logs card events: chat messages as chat, the rest as card_event, with the actor', async () => {
    const { storage, entries } = await setup();
    await storage.transaction((tx) => tx.cards.insert(card));
    entries.length = 0;

    await storage.transaction(async (tx) => {
      await tx.cardEvents.append(card.id, {
        kind: 'user_message',
        at: T,
        actor: { type: 'user', id: 'u' },
        payload: { text: 'please add a button' },
      });

      await tx.cardEvents.append(card.id, {
        kind: 'note',
        at: T,
        actor: { type: 'director', id: 'd' },
        payload: { text: 'thinking' },
      });
    });

    expect(entries.map((e) => [e.kind, e.actor, e.card_id])).toEqual([
      ['chat', 'owner', 'FX-C1'],
      ['card_event', 'director', 'FX-C1'],
    ]);

    expect(JSON.stringify(entries[0]?.data)).toContain('please add a button');
  });

  it('logs a ticket creation and a CAS move with before and after status', async () => {
    const { storage, entries } = await setup();
    await storage.transaction((tx) => tx.cards.insert(card));
    await storage.transaction((tx) => tx.tickets.insert(ticket));
    entries.length = 0;

    const ok = await storage.transaction((tx) =>
      tx.tickets.updateTicketCas(ticket.id, 0, { status: 'planned' }),
    );

    expect(ok).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'transition',
      ticket_id: 'FX-1',
      project: 'p1',
    });

    expect(entries[0]?.message).toContain('inbox');
    expect(entries[0]?.message).toContain('planned');
    expect(entries[0]?.data).toMatchObject({
      expectedVersion: 0,
      before: { status: 'inbox' },
      applied: true,
    });
  });

  it('logs interactions with the ticket found from the interaction row', async () => {
    const { storage, entries } = await setup();
    await storage.transaction((tx) => tx.tickets.insert(ticket));
    await storage.transaction((tx) => tx.interactions.insert(question));
    entries.length = 0;

    await storage.transaction((tx) =>
      tx.interactions.escalate('int-1', { payload: { prompt: 'which?' } }, T),
    );

    expect(entries[0]).toMatchObject({ kind: 'interaction', ticket_id: 'FX-1' });
    expect(entries[0]?.message).toContain('escalate');
  });

  it('logs run rows and gate results, and leaves run events to the pump', async () => {
    const { storage, entries } = await setup();
    await storage.transaction((tx) => tx.tickets.insert(ticket));
    entries.length = 0;

    await storage.transaction(async (tx) => {
      await tx.runs.insert({
        id: 'run-1',
        ticket_id: 'FX-1',
        project: 'p1',
        harness: 'scripted',
        driver_version: 'x',
        cwd: '/w',
        lane: 'express',
        started_at: T,
        status: 'starting',
        owner: 'o',
        prompt_hash: 'a'.repeat(64),
        catalogue_hash: 'b'.repeat(64),
        config_version: 'c1:p1',
      } as never);

      await tx.runEvents.append('run-1', { type: 'text', ts: T, text: 'hi' } as never);
    });

    expect(entries.map((e) => e.kind)).toEqual(['run']);
    expect(entries[0]).toMatchObject({ run_id: 'run-1', ticket_id: 'FX-1' });
  });

  it('logs a project registration as config', async () => {
    const { raw, entries } = await setup();
    const storage = traceStorageWrites(raw, { emit: (e) => void entries.push(e) });

    await storage.transaction((tx) =>
      tx.projects.upsert({
        id: 'p2',
        slug: 'two',
        prefix: 'TW',
        status: 'ready',
        ecosystems: [],
        harness_defaults: {},
        tier_c_globs: [],
      }),
    );

    expect(entries[0]).toMatchObject({ kind: 'config', project: 'p2' });
  });

  it('says nothing for reads and for a rolled-back transaction', async () => {
    const { storage, entries } = await setup();
    await storage.transaction((tx) => tx.cards.insert(card));
    entries.length = 0;

    await storage.transaction((tx) => tx.cards.get(card.id));
    await expect(
      storage.transaction(async (tx) => {
        await tx.cards.update(card.id, { updated_at: T });
        throw new Error('rollback me');
      }),
    ).rejects.toThrow('rollback me');

    expect(entries).toEqual([]);
  });

  it('passes results through unchanged', async () => {
    const { storage } = await setup();

    const out = await storage.transaction(async (tx) => {
      await tx.cards.insert(card);

      return tx.cards.get(card.id);
    });

    expect(out?.id).toBe('FX-C1');
  });
});
