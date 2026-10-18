/**
 * Seeds a project's research footprint for the purge contract.
 *
 * Why: deleting a project must remove the pages the Director and its Workers fetched and the evidence checked
 *   from them, or a re-added slug would show another project's research (d-0144). The purge contract needs one
 *   Director source with evidence on a card and one Worker source on a run; the rows live here so the contract
 *   file stays readable.
 *
 * Exports: seedResearch().
 * Depends on: @forge/core (types), helpers/fixtures. IO: writes through the transaction it is given.
 */

import type { CardId, StorageTx, TicketId } from '@forge/core';
import { T0 } from '#tests/helpers/fixtures.js';

const HASH = 'a'.repeat(64);

/** A Director source and one claim on `cardId`, and a Worker source on `runId`, all under `slug`. */
export async function seedResearch(
  t: StorageTx,
  slug: string,
  cardId: CardId,
  ticketId: TicketId,
  runId: string,
): Promise<void> {
  const page = {
    project: slug,
    origin: 'director' as const,
    url: 'https://example.com/a',
    final_url: 'https://example.com/a',
    title: 'A',
    retrieved_at: T0,
    sha256: HASH,
    bytes: 3,
    truncated: false,
    text: 'abc',
  };

  await t.researchSources.insert({ ...page, card_id: cardId, ref: 'S1' });
  await t.researchSources.insert({
    ...page,
    origin: 'worker',
    ticket_id: ticketId,
    run_id: runId,
  });

  await t.evidence.insertMany(cardId, [
    {
      step_id: 'research',
      origin: 'research_step',
      claim: 'A claim long enough',
      quotes: [],
      sources: ['S1'],
      status: 'unverified',
      created_at: T0,
    },
  ]);
}
