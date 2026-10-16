/**
 * Card creation and dependency edits: the engine's one door for new cards and card edges.
 *
 * Why: a request must become a card the Director plans before any ticket exists (d-0128),
 *   whether it comes from the create-card form or from chat intake, so both go through one
 *   function that numbers the card, stores it in `grilling`, writes the owner's words as the
 *   first card event and queues the Director's reply in the same transaction. The reply is
 *   stored, not remembered, so a restart cannot lose it (d-0134). Dependencies are checked
 *   in the same transaction as the write: every id must be a card of this project, and the
 *   new edges must not close a loop (`findCycle`), or two cards would wait on each other
 *   forever. A repeated `dedupe_key` returns the first card, so a double click never makes
 *   two. Only the PR fast path files a ticket at creation; its card starts `queued` and
 *   follows its ticket from there.
 *
 * Exports: createCardTx(), createCard(), setCardRelations(), findProjectBySlug().
 * Depends on: @forge/core (card schemas, findCycle, makeCardId), tick/card-log, tick/tick-requests,
 *   types/card-create. Writes storage.
 */

import { CardId, findCycle, makeCardId } from '@forge/core';
import type { Card, GraphEdge, Project, StorageTx } from '@forge/core';
import { iso } from '#/shared/time.js';
import { logCardEvent } from '#/tick/card-log.js';
import { requestTick } from '#/tick/tick-requests.js';
import type {
  CreateCardInput,
  CreateCardResult,
  NewCard,
  RelationRefusal,
  SetCardRelationsInput,
  SetCardRelationsResult,
} from '#/types/card-create.types.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** The project with this slug (its id is the slug in practice), or null. */
export async function findProjectBySlug(
  tx: StorageTx,
  slug: string,
): Promise<Project | null> {
  const byId = await tx.projects.get(slug);

  return byId ?? (await tx.projects.list()).find((p) => p.slug === slug) ?? null;
}

/** Edges of the project's cards, minus the ones that touch `except` (about to be replaced). */
async function existingEdges(
  tx: StorageTx,
  project: Project,
  except: CardId | undefined,
): Promise<GraphEdge<CardId>[]> {
  return (await tx.cardRelations.listByProject(project.id))
    .filter((r) => r.from !== except && r.to !== except)
    .map((r) => ({ from: r.from, to: r.to }));
}

/**
 * Checks that every id is a card of `project` and that making `cardId` depend on `dependsOn`
 * and be a dependency of `blocks` closes no loop. Null when the edges are fine.
 */
async function refuseRelations(
  tx: StorageTx,
  project: Project,
  cardId: CardId,
  dependsOn: readonly string[],
  blocks: readonly string[],
  replacing: boolean,
): Promise<RelationRefusal | null> {
  for (const raw of [...dependsOn, ...blocks]) {
    const id = CardId.safeParse(raw);
    const other = id.success ? await tx.cards.get(id.data) : null;
    if (!other) {
      return { status: 'card_not_found', id: raw };
    }

    if (other.project !== project.id) {
      return { status: 'cross_project_dependency', id: raw };
    }
  }

  const added: GraphEdge<CardId>[] = [
    ...dependsOn.map((to) => ({ from: cardId, to: to as CardId })),
    ...blocks.map((from) => ({ from: from as CardId, to: cardId })),
  ];

  const cycle = findCycle(
    await existingEdges(tx, project, replacing ? cardId : undefined),
    added,
  );

  return cycle ? { status: 'dependency_cycle', cycle } : null;
}

/** Creates the card, its first event, its edges and its queued reply inside `tx`; a refused dependency stores nothing. */
export async function createCardTx(
  tx: StorageTx,
  project: Project,
  input: NewCard,
): Promise<{ card: Card } | RelationRefusal> {
  const cardId = makeCardId(project.prefix, await tx.cards.nextNumber(project.prefix));
  const dependsOn = [...new Set(input.dependsOn ?? [])];
  const blocks = [...new Set(input.blocks ?? [])];
  const refusal = await refuseRelations(tx, project, cardId, dependsOn, blocks, false);
  if (refusal) {
    return refusal;
  }

  const card: Card = {
    id: cardId,
    project: project.id,
    type: input.type,
    title: input.title,
    summary: input.summary,
    source: input.source,
    created_by: input.creator,
    created_at: input.at,
    updated_at: input.at,
    phase: input.phase,
    phase_version: 0,
    needs_you: false,
    priority: input.priority ?? 'normal',
    links: [...(input.links ?? [])],
  };

  await tx.cards.insert(card);
  if (dependsOn.length > 0 || blocks.length > 0) {
    await tx.cardRelations.replaceFor(
      cardId,
      dependsOn as CardId[],
      blocks as CardId[],
      input.at,
    );
  }

  const event = await logCardEvent(tx, cardId, {
    kind: 'user_message',
    at: input.at,
    actor: input.creator,
    payload: { text: input.message },
  });

  if (input.wake && event) {
    await tx.cardReplyQueue.enqueue({
      card_id: cardId,
      event_id: event.seq,
      reason: 'card_created',
      enqueued_at: input.at,
    });
  }

  return { card };
}

/** `POST /projects/:slug/cards`: creates a card in `grilling`, or returns the one this `dedupe_key` made before. */
export async function createCard(
  deps: EngineDeps,
  state: EngineState,
  input: CreateCardInput,
): Promise<CreateCardResult> {
  const at = iso(deps.clock.now());
  const result = await deps.storage.transaction(async (tx): Promise<CreateCardResult> => {
    const project = await findProjectBySlug(tx, input.project);
    if (!project) {
      return { status: 'project_not_found' };
    }

    if (project.status === 'archived') {
      return { status: 'project_archived' };
    }

    const type = await tx.cardTypes.get(input.type);
    if (!type) {
      return { status: 'invalid_type', reason: `unknown card type ${input.type}` };
    }

    if (!type.allowed_sources.includes('chat')) {
      return {
        status: 'invalid_type',
        reason: `card type ${input.type} does not accept chat`,
      };
    }

    const first = await tx.cards.findBySource(project.id, 'chat', input.dedupe_key);
    if (first) {
      return { status: 'duplicate', card: first };
    }

    const made = await createCardTx(tx, project, {
      type: input.type,
      title: input.title,
      summary: input.description,
      message: `${input.title}\n\n${input.description}`,
      source: { kind: 'chat', ref: input.dedupe_key },
      creator: input.actor,
      priority: input.priority,
      links: input.links,
      dependsOn: input.depends_on,
      blocks: input.blocks,
      phase: 'grilling',
      wake: true,
      at,
    });

    return 'card' in made ? { status: 'created', card: made.card } : made;
  });

  if (result.status === 'created') {
    requestTick(deps, state);
  }

  return result;
}

/** `PUT /cards/:id/relations`: replaces the card's dependency edges after the same checks as creation. */
export async function setCardRelations(
  deps: EngineDeps,
  cardId: string,
  input: SetCardRelationsInput,
): Promise<SetCardRelationsResult> {
  const id = CardId.safeParse(cardId);
  if (!id.success) {
    return { status: 'card_not_found', id: cardId };
  }

  const at = iso(deps.clock.now());

  return deps.storage.transaction(async (tx): Promise<SetCardRelationsResult> => {
    const card = await tx.cards.get(id.data);
    const project = card ? await tx.projects.get(card.project) : null;
    if (!card || !project) {
      return { status: 'card_not_found', id: cardId };
    }

    const dependsOn = [...new Set(input.depends_on)];
    const blocks = [...new Set(input.blocks)];
    const refusal = await refuseRelations(tx, project, card.id, dependsOn, blocks, true);
    if (refusal) {
      return refusal;
    }

    await tx.cardRelations.replaceFor(
      card.id,
      dependsOn as CardId[],
      blocks as CardId[],
      at,
    );

    await logCardEvent(tx, card.id, {
      kind: 'note',
      at,
      actor: input.actor,
      payload: {
        text: `Dependencies updated. Depends on: ${dependsOn.join(', ') || 'nothing'}. Blocks: ${blocks.join(', ') || 'nothing'}.`,
      },
    });

    return { status: 'updated', card: (await tx.cards.get(card.id)) ?? card };
  });
}
