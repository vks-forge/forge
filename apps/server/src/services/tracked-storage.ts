/**
 * Storage that announces what it wrote: every committed write to cards, tickets, questions or
 * inbox marks invalidates the project's live queries.
 *
 * Why: the control room must update within a second of any change (d-0132), and the changes
 *   come from many places (the engine tick, intake, the card routes, answers, the settle of
 *   a run). Asking each writer to remember to notify would miss one sooner or later. Wrapping
 *   the one storage port instead means a write cannot be forgotten: the wrapper notes which
 *   card, ticket or question each write touched, resolves them to the project and the TanStack
 *   query keys inside the same transaction (before the commit, so the reads see the rows),
 *   and only after the commit succeeds tells the hub. A rolled-back transaction announces
 *   nothing. Keys follow the web client's: `["cards", slug]`, `["card", id]`,
 *   `["tickets", slug]`, `["inbox", slug]`. The ticket page's `["ticket", id]` is touched
 *   by every ticket and interaction write, and `["card", id]` covers the card's events and escalations by prefix.
 *   A write to a ticket's pipeline snapshot, a stage row (started or finished) or a stage artifact
 *   announces `["ticket-pipeline", id]` and `["ticket", id]`, so the strip on the ticket page moves
 *   as the stages do; a finished row is resolved to its ticket by id before the commit. The Director's change
 *   to a ticket's copy and the owner's mark on a finding announce the same keys. A pipeline proposal announces
 *   `["pipeline-proposals", slug]` and `["inbox", slug]` when it is made, and when it is decided also
 *   `["pipelines", "project", slug]` and `["project-settings", slug]` (an accepted one changed the lane).
 *   Research: new evidence or a Director source announces `["card-evidence", id]` and `["card", id]`; a Worker's page
 *   read announces `["run-sources", runId]`; a `budget_warning` event and a change of a card's cap also announce
 *   `["inbox", slug]`. A write to a project's memory (a record, a move, a search aid or an import attempt) announces
 *   `["memory", slug]`.
 *
 * Exports: trackProjectWrites().
 * Depends on: @forge/core (storage ports), services/tracked-resolve, services/tracked-watch, types/project-events,
 *   types/tracked-storage.
 *   IO: extra reads inside the caller's transaction.
 */

import type { StorageAdapter, StorageTx } from '@forge/core';
import type { ProjectEvents } from '#/types/project-events.types.js';
import { resolve } from '#/services/tracked-resolve.js';
import { first, watch } from '#/services/tracked-watch.js';
import type { Recorder, Resolved, Touch } from '#/types/tracked-storage.types.js';

function track(tx: StorageTx, touches: Touch[]): StorageTx {
  const card: Recorder = (a) => ({ kind: 'card', id: first(a) });
  const ticket: Recorder = (a) => ({
    kind: 'ticket',
    id: typeof a[0] === 'string' ? a[0] : (a[0] as { id: string }).id,
  });

  const interaction: Recorder = (a) => {
    const row = a[0] as { id?: string; card_id?: string } | string;

    return typeof row === 'string'
      ? { kind: 'interaction', id: row }
      : {
          kind: 'interaction',
          id: String(row.id),
          ...(row.card_id === undefined ? {} : { cardId: row.card_id }),
        };
  };

  return {
    ...tx,
    cards: watch(tx.cards, touches, {
      insert: (a) => ({ kind: 'card', id: (a[0] as { id: string }).id }),
      // A cap change moves the Inbox's budget warnings (they show only for the cap in force).
      update: (a) =>
        'budget_cap_usd' in (a[1] as object)
          ? [
              { kind: 'card', id: first(a) },
              { kind: 'card_inbox', id: first(a) },
            ]
          : { kind: 'card', id: first(a) },
      updatePhase: card,
    }),
    cardEvents: watch(tx.cardEvents, touches, {
      // A budget warning is an Inbox item too.
      append: (a) =>
        (a[1] as { kind?: string }).kind === 'budget_warning'
          ? [
              { kind: 'card', id: first(a) },
              { kind: 'card_inbox', id: first(a) },
            ]
          : { kind: 'card', id: first(a) },
    }),
    evidence: watch(tx.evidence, touches, {
      insertMany: (a) => ({ kind: 'card_evidence', id: first(a) }),
    }),
    researchSources: watch(tx.researchSources, touches, {
      insert: (a) => {
        const s = a[0] as { card_id?: string; run_id?: string; project: string };

        return s.card_id === undefined
          ? { kind: 'run_sources', id: s.run_id ?? '', project: s.project }
          : { kind: 'card_evidence', id: s.card_id };
      },
    }),
    cardRelations: watch(tx.cardRelations, touches, {
      replaceFor: (a) => [
        { kind: 'card', id: first(a) },
        ...(a[1] as string[]).map((id): Touch => ({ kind: 'card', id })),
        ...(a[2] as string[]).map((id): Touch => ({ kind: 'card', id })),
      ],
      add: (a) => {
        const edge = a[0] as { from: string; to: string };

        return [
          { kind: 'card', id: edge.from },
          { kind: 'card', id: edge.to },
        ];
      },
    }),
    cardReplyQueue: watch(tx.cardReplyQueue, touches, {
      enqueue: (a) => ({ kind: 'card', id: (a[0] as { card_id: string }).card_id }),
    }),
    tickets: watch(tx.tickets, touches, { insert: ticket, updateTicketCas: ticket }),
    ticketRelations: watch(tx.ticketRelations, touches, {
      add: (a) => ({ kind: 'ticket', id: (a[0] as { from_id: string }).from_id }),
      remove: (a) => ({ kind: 'ticket', id: first(a) }),
    }),
    interactions: watch(tx.interactions, touches, {
      insert: interaction,
      update: interaction,
      answer: interaction,
      expire: interaction,
      escalate: interaction,
    }),
    ticketPipelines: watch(tx.ticketPipelines, touches, {
      insert: (a) => ({
        kind: 'pipeline',
        id: (a[0] as { ticket_id: string }).ticket_id,
      }),
      replace: (a) => ({
        kind: 'pipeline',
        id: (a[0] as { ticket_id: string }).ticket_id,
      }),
      appendRouted: (a) => ({ kind: 'pipeline', id: first(a) }),
      adjust: (a) => ({ kind: 'pipeline', id: first(a) }),
    }),
    findingMarks: watch(tx.findingMarks, touches, {
      set: (a) => ({ kind: 'pipeline', id: (a[0] as { ticket_id: string }).ticket_id }),
      clear: (a) => ({ kind: 'stage_run', id: Number(a[0]) }),
    }),
    pipelineProposals: watch(tx.pipelineProposals, touches, {
      insert: (a) => ({
        kind: 'proposal',
        project: (a[0] as { project: string }).project,
      }),
      decide: (a) => ({ kind: 'proposal_decided', id: Number(a[0]) }),
    }),
    stageRuns: watch(tx.stageRuns, touches, {
      start: (a) => ({ kind: 'pipeline', id: (a[0] as { ticket_id: string }).ticket_id }),
      finish: (a) => ({ kind: 'stage_run', id: Number(a[0]) }),
    }),
    stageArtifacts: watch(tx.stageArtifacts, touches, {
      add: (a) => ({ kind: 'pipeline', id: (a[0] as { ticket_id: string }).ticket_id }),
    }),
    memory: watch(tx.memory, touches, {
      insertRecord: (a) => ({
        kind: 'memory',
        slug: (a[0] as { project: string }).project,
      }),
      transition: (a) => ({ kind: 'memory', slug: String(a[0]) }),
      setAids: (a) => ({ kind: 'memory', slug: String(a[0]) }),
      saveImport: (a) => ({ kind: 'memory', slug: String(a[0]) }),
    }),
    inboxStates: watch(tx.inboxStates, touches, {
      upsert: (a) => ({ kind: 'inbox', project: (a[0] as { project: string }).project }),
    }),
  };
}

/** `storage` whose committed writes call `events.invalidate`; all other behaviour is unchanged. */
export function trackProjectWrites(
  storage: StorageAdapter,
  events: ProjectEvents,
): StorageAdapter {
  return {
    close: () => storage.close(),
    async transaction(fn) {
      let resolved: Resolved = new Map();
      const out = await storage.transaction(async (tx) => {
        const touches: Touch[] = [];
        const result = await fn(track(tx, touches));
        resolved = await resolve(tx, touches);

        return result;
      });

      for (const [slug, keys] of resolved) {
        events.invalidate(slug, [...keys.values()]);
      }

      return out;
    },
  };
}
