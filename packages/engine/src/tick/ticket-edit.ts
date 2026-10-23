/**
 * Ticket edit door: the engine's one way to change a ticket's priority, description or waits.
 *
 * Why: until now only plan approval wrote `depends_on`, and nothing let the owner or the card's
 *   Director raise a priority or fix a brief, so restored work could not be ordered before the
 *   tickets that needed it. Every edit, from the ticket page or from the card chat, runs here:
 *   `checkTicketEdit` (same project, no loop, no cancelled target, no change a running Worker
 *   would miss), then the field and edge writes and a plain-words note on the card, all in one
 *   transaction so the history never claims an edit that rolled back (code.md rule 6). The
 *   dependency set is the ticket's complete list; edges are diffed here so callers never must.
 *   After a commit the tick is woken, because dropping a wait can make a ticket startable.
 *
 * Exports: editTicketTx(), editTicket().
 * Depends on: @forge/core (checkTicketEdit, ticket schemas), shared/time, tick/card-log,
 *   tick/tick-requests, tick/ticket-moves, types/ticket-edit. Writes storage.
 */

import { checkTicketEdit } from '@forge/core';
import type {
  CardActor,
  GraphEdge,
  StorageTx,
  Ticket,
  TicketEditBody,
  TicketId,
} from '@forge/core';
import { iso } from '#/shared/time.js';
import { logCardEvent } from '#/tick/card-log.js';
import { requestTick } from '#/tick/tick-requests.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';
import type { EditTicketResult } from '#/types/ticket-edit.types.js';

/** Who a card note names: "Owner" for the user, "The Director" for a Director step. */
function actorLabel(actor: CardActor): string {
  return actor.type === 'user' ? 'Owner' : 'The Director';
}

/** Edges "from waits for to" of `node`; the ticket's own `depends_on` edges are being replaced, so they are left out. */
async function waitsOf(
  tx: StorageTx,
  node: TicketId,
  editing: TicketId,
): Promise<GraphEdge<TicketId>[]> {
  const out: GraphEdge<TicketId>[] = [];
  for (const rel of await tx.ticketRelations.listFor(node)) {
    if (rel.kind === 'depends_on' && rel.from_id === node && node !== editing) {
      out.push({ from: node, to: rel.to_id });
    } else if (rel.kind === 'blocks' && rel.to_id === node) {
      out.push({ from: node, to: rel.from_id });
    }
  }

  return out;
}

/** Every waiting edge reachable from the new targets and from the edited ticket, for the loop check. */
async function reachableEdges(
  tx: StorageTx,
  ticketId: TicketId,
  targets: readonly TicketId[],
): Promise<GraphEdge<TicketId>[]> {
  const seen = new Set<TicketId>();
  const edges: GraphEdge<TicketId>[] = [];
  const queue: TicketId[] = [ticketId, ...targets];
  while (queue.length > 0) {
    const node = queue.pop() as TicketId;
    if (seen.has(node)) {
      continue;
    }

    seen.add(node);
    for (const edge of await waitsOf(tx, node, ticketId)) {
      edges.push(edge);
      queue.push(edge.to);
    }
  }

  return edges;
}

function sentences(
  who: string,
  ticket: Ticket,
  edit: TicketEditBody,
  added: readonly string[],
  removed: readonly string[],
): string[] {
  const parts: string[] = [];
  if (edit.priority !== undefined && edit.priority !== ticket.priority) {
    parts.push(
      `${who} changed the priority of ${ticket.id} from ${ticket.priority} to ${edit.priority}`,
    );
  }

  if (edit.body !== undefined && edit.body !== ticket.body) {
    parts.push(`${who} changed the description of ${ticket.id}`);
  }

  if (added.length > 0) {
    parts.push(`${who} made ${ticket.id} wait for ${added.join(', ')}`);
  }

  if (removed.length > 0) {
    parts.push(`${who} stopped ${ticket.id} waiting for ${removed.join(', ')}`);
  }

  return parts;
}

/**
 * Applies `edit` to the ticket inside `tx`; a refusal writes nothing. Used directly by the card
 * chat (so its refusal note shares the transaction) and by `editTicket()` for the route.
 */
export async function editTicketTx(
  tx: StorageTx,
  ticketId: TicketId,
  edit: TicketEditBody,
  actor: CardActor,
  at: string,
): Promise<EditTicketResult> {
  const ticket = await tx.tickets.get(ticketId);
  if (!ticket) {
    return { status: 'ticket_not_found' };
  }

  const next = [...new Set<string>(edit.depends_on ?? [])] as TicketId[];
  const targets = new Map<string, Ticket | null>();
  for (const id of next) {
    targets.set(id, await tx.tickets.get(id));
  }

  const own = await tx.ticketRelations.listFor(ticketId);
  const current = own
    .filter((r) => r.kind === 'depends_on' && r.from_id === ticketId)
    .map((r) => r.to_id as string);

  const check = checkTicketEdit(edit, {
    ticket,
    targets,
    currentDependsOn: current,
    edges: edit.depends_on === undefined ? [] : await reachableEdges(tx, ticketId, next),
  });

  if (!check.ok) {
    return {
      status: 'refused',
      code: check.code,
      message: check.message,
      ids: check.ids,
    };
  }

  const added =
    edit.depends_on === undefined ? [] : next.filter((id) => !current.includes(id));

  const removed =
    edit.depends_on === undefined
      ? []
      : current.filter((id) => !next.includes(id as TicketId));

  const fields = {
    ...(edit.body === undefined ? {} : { body: edit.body }),
    ...(edit.priority === undefined ? {} : { priority: edit.priority }),
  };

  if (Object.keys(fields).length > 0) {
    // Field writes go through the ticket-moves door like every other ticket write (code.md rule 6).
    const moved = await moveTicketTx(tx, ticketId, at, () => ({ events: [], fields }));

    // Nothing is written before this CAS, so a lost race stores nothing.
    if (!moved.ok) {
      return { status: 'stale' };
    }
  }

  for (const id of removed) {
    await tx.ticketRelations.remove(ticketId, id as TicketId, 'depends_on');
  }

  for (const id of added) {
    await tx.ticketRelations.add({
      from_id: ticketId,
      to_id: id,
      kind: 'depends_on',
      created_at: at,
    });
  }

  const parts = sentences(actorLabel(actor), ticket, edit, added, removed);
  if (parts.length > 0) {
    const text = `${parts.join('. ')}.`;
    await logCardEvent(tx, ticket.card_id, {
      kind: 'note',
      at,
      actor,
      payload: { text },
    });
  }

  return { status: 'updated', ticket: (await tx.tickets.get(ticketId)) ?? ticket };
}

/** `PATCH /tickets/:id`: one transaction, then wakes the tick (a dropped wait can make the ticket startable). */
export async function editTicket(
  deps: EngineDeps,
  state: EngineState,
  ticketId: TicketId,
  edit: TicketEditBody,
  actor: CardActor,
): Promise<EditTicketResult> {
  const at = iso(deps.clock.now());
  const out = await deps.storage.transaction((tx) =>
    editTicketTx(tx, ticketId, edit, actor, at),
  );

  if (out.status === 'updated') {
    requestTick(deps, state);
  }

  return out;
}
