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
 *
 * Exports: trackProjectWrites().
 * Depends on: @forge/core (storage ports), types/project-events, types/tracked-storage. IO: extra
 *   reads inside the caller's transaction.
 */

import type { QueryKey, StorageAdapter, StorageTx } from '@forge/core';
import type { ProjectEvents } from '#/types/project-events.types.js';
import type { Recorder, Resolved, Touch } from '#/types/tracked-storage.types.js';

/** Wraps `repo` so that each listed method records what it touched after it succeeds. */
function watch<R extends object>(
  repo: R,
  touches: Touch[],
  writes: Readonly<Record<string, Recorder>>,
): R {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      const record = typeof prop === 'string' ? writes[prop] : undefined;
      if (typeof value !== 'function' || !record) {
        return value;
      }

      return async (...args: unknown[]) => {
        const out = await (value as (...a: unknown[]) => Promise<unknown>).apply(
          target,
          args,
        );

        touches.push(...[record(args)].flat());

        return out;
      };
    },
  });
}

const first = (args: readonly unknown[]): string => String(args[0]);

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
      update: card,
      updatePhase: card,
    }),
    cardEvents: watch(tx.cardEvents, touches, {
      append: (a) => ({ kind: 'card', id: first(a) }),
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
    inboxStates: watch(tx.inboxStates, touches, {
      upsert: (a) => ({ kind: 'inbox', project: (a[0] as { project: string }).project }),
    }),
  };
}

/** Turns the touches into query keys per project slug, reading inside the open transaction. */
async function resolve(tx: StorageTx, touches: readonly Touch[]): Promise<Resolved> {
  const out: Resolved = new Map();
  const slugs = new Map<string, string>();
  const slugOf = async (projectId: string): Promise<string> => {
    const known = slugs.get(projectId);
    if (known !== undefined) {
      return known;
    }

    const slug = (await tx.projects.get(projectId))?.slug ?? projectId;
    slugs.set(projectId, slug);

    return slug;
  };

  const add = async (projectId: string, ...keys: QueryKey[]): Promise<void> => {
    const slug = await slugOf(projectId);
    const bucket = out.get(slug) ?? new Map<string, QueryKey>();
    for (const key of keys) {
      bucket.set(JSON.stringify(key), key);
    }

    out.set(slug, bucket);
  };

  const addCard = async (id: string, withList: boolean): Promise<void> => {
    const card = await tx.cards.get(id as never);
    if (!card) {
      return;
    }

    const slug = await slugOf(card.project);
    await add(
      card.project,
      ['card', id],
      ...(withList ? [['cards', slug] as const] : []),
    );
  };

  for (const t of touches) {
    switch (t.kind) {
      case 'card':
        await addCard(t.id, true);
        break;
      case 'inbox':
        await add(t.project, ['inbox', await slugOf(t.project)]);
        break;
      case 'ticket':
      case 'interaction': {
        const ticket =
          t.kind === 'ticket'
            ? await tx.tickets.get(t.id as never)
            : await ticketOfInteraction(tx, t.id);

        if (ticket) {
          const slug = await slugOf(ticket.project);
          await add(
            ticket.project,
            ['ticket', ticket.id],
            ['tickets', slug],
            ['cards', slug],
            ['inbox', slug],
          );

          if (ticket.card_id) {
            await addCard(ticket.card_id, false);
          }
        }

        if (t.kind === 'interaction' && t.cardId !== undefined) {
          await addCard(t.cardId, true);
          const card = await tx.cards.get(t.cardId as never);
          if (card) {
            await add(card.project, ['inbox', await slugOf(card.project)]);
          }
        }

        break;
      }
    }
  }

  return out;
}

async function ticketOfInteraction(tx: StorageTx, interactionId: string) {
  const row = await tx.interactions.get(interactionId);

  return row ? tx.tickets.get(row.ticket_id as never) : null;
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
