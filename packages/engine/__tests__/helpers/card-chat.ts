/**
 * Shared helpers for the card chat scenarios.
 *
 * Why: the chat scenarios are split over two files (talk and error handling, actions); both
 *   read the same card history, seed the same Discussion and post the same kind of message,
 *   so the helpers live once.
 *
 * Exports: C1, history(), kinds(), card(), discussion(), say().
 * Depends on: helpers/rig, @forge/core types.
 */

import type { CardEvent, CardId } from '@forge/core';
import { intake } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';

export const C1 = 'FG-C1' as CardId;

export const history = (rig: Rig, id: CardId = C1): Promise<CardEvent[]> =>
  rig.storage.transaction((tx) => tx.cardEvents.list(id, { limit: 100 }));

export const kinds = async (rig: Rig, id: CardId = C1) =>
  (await history(rig, id)).map((e) => e.kind);

export const card = (rig: Rig, id: CardId = C1) =>
  rig.storage.transaction((tx) => tx.cards.get(id));

export async function discussion(rig: Rig): Promise<void> {
  await rig.engine.ingest(
    intake({ payload: { text: 'Should we move to pnpm?', card_type: 'discussion' } }),
  );
}

export const say = (rig: Rig, text = 'please help', id = 'FG-C1') =>
  rig.engine.postCardMessage(id, text, 'vikash');
