/**
 * Resolves what a transaction's writes touched into the query keys to announce.
 *
 * Why: the tracked storage notes each write as a small "touch" (a card, a ticket, a question, an inbox mark, a
 *   pipeline row, a proposal, evidence, a run's sources) and only at the end of the transaction, still inside it,
 *   turns the touches into the web client's query keys per project slug, so the reads see the rows and a rolled
 *   back transaction announces nothing. The keys follow the web client's: `["cards", slug]`, `["card", id]`,
 *   `["tickets", slug]`, `["inbox", slug]`, `["ticket", id]`, `["ticket-pipeline", id]`, `["card-evidence", id]`,
 *   `["run-sources", runId]`.
 *
 * Exports: resolve().
 * Depends on: @forge/core (QueryKey, StorageTx), types/tracked-storage. IO: extra reads inside the caller's
 *   transaction.
 */

import type { QueryKey, StorageTx } from '@forge/core';
import type { Resolved, Touch } from '#/types/tracked-storage.types.js';

/** Turns the touches into query keys per project slug, reading inside the open transaction. */
export async function resolve(
  tx: StorageTx,
  touches: readonly Touch[],
): Promise<Resolved> {
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
      case 'card_evidence': {
        const owner = await tx.cards.get(t.id as never);
        if (owner) {
          await add(owner.project, ['card-evidence', t.id], ['card', t.id]);
        }

        break;
      }

      case 'run_sources':
        await add(t.project, ['run-sources', t.id]);
        break;
      case 'card_inbox': {
        const owner = await tx.cards.get(t.id as never);
        if (owner) {
          await add(owner.project, ['inbox', await slugOf(owner.project)]);
        }

        break;
      }

      case 'pipeline':
      case 'stage_run': {
        const ticketId =
          t.kind === 'pipeline' ? t.id : (await tx.stageRuns.get(t.id))?.ticket_id;

        const ticket = ticketId ? await tx.tickets.get(ticketId as never) : null;
        if (ticket) {
          await add(
            ticket.project,
            ['ticket-pipeline', ticket.id],
            ['ticket', ticket.id],
          );
        }

        break;
      }

      case 'proposal': {
        const slug = await slugOf(t.project);
        await add(t.project, ['pipeline-proposals', slug], ['inbox', slug]);
        break;
      }

      case 'proposal_decided': {
        const proposal = await tx.pipelineProposals.get(t.id);
        if (proposal) {
          const slug = await slugOf(proposal.project);
          // An accepted proposal also changed the lane's own list in the project's settings.
          await add(
            proposal.project,
            ['pipeline-proposals', slug],
            ['inbox', slug],
            ['pipelines', 'project', slug],
            ['project-settings', slug],
          );
        }

        break;
      }

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
