/**
 * Pins: runs of three or more ticket log lines fold into one item with a plain-words summary;
 * two stay as lines; speech and day changes split runs; a fold's key is its first line's.
 *
 * Why: ten ticket updates between two Director messages bury the conversation, but a fold that
 *   swallowed a message, a question or a day boundary, or lost track of where tickets stand,
 *   would hide something the owner is watching. The key must survive a refetch or a new line
 *   so an opened fold does not snap shut.
 * Depends on: domain/chat-folds, domain/card-chat (lineOf). Pure.
 */

import { describe, expect, it } from 'vitest';
import { lineOf } from '#/domain/card-chat.js';
import { foldTicketRuns } from '#/domain/chat-folds.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';
import type { ChatLine } from '#/types/cards-ui.types.js';
import type { ChatRowMeta } from '#/types/chat.types.js';

const event = (
  seq: number,
  kind: string,
  payload: Record<string, unknown> = {},
): CardHistoryEvent => ({
  seq,
  kind,
  at: '2026-10-16T10:00:00.000Z',
  actor: { type: 'system', id: 'forge' },
  payload,
});

const created = (seq: number, id: string) =>
  lineOf(event(seq, 'ticket_created', { ticket_id: id, title: `Title ${id}` }));

const moved = (seq: number, id: string, to: string) =>
  lineOf(event(seq, 'ticket_state', { ticket_id: id, from: 'planned', to }));

const speech = (seq: number) => lineOf(event(seq, 'director_message', { text: 'Hi' }));

const quiet = (lines: readonly ChatLine[]): ChatRowMeta[] =>
  lines.map(() => ({ header: false, day: null }));

describe('foldTicketRuns', () => {
  it('leaves two ticket lines as lines', () => {
    const lines = [created(1, 'FR-1'), moved(2, 'FR-1', 'in_progress')];

    const items = foldTicketRuns(lines, quiet(lines));

    expect(items.map((item) => item.kind)).toEqual(['line', 'line']);
  });

  it('folds three or more consecutive ticket lines into one item', () => {
    const lines = [created(1, 'FR-1'), created(2, 'FR-2'), moved(3, 'FR-1', 'done')];

    const items = foldTicketRuns(lines, quiet(lines));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'fold', index: 0 });
  });

  it('is split by a Director message', () => {
    const lines = [
      created(1, 'FR-1'),
      created(2, 'FR-2'),
      speech(3),
      created(4, 'FR-3'),
      created(5, 'FR-4'),
    ];

    const items = foldTicketRuns(lines, quiet(lines));

    expect(items.map((item) => item.kind)).toEqual([
      'line',
      'line',
      'line',
      'line',
      'line',
    ]);
  });

  it('never spans a day separator', () => {
    const lines = [
      created(1, 'FR-1'),
      created(2, 'FR-2'),
      created(3, 'FR-3'),
      created(4, 'FR-4'),
    ];

    const metas: ChatRowMeta[] = [
      { header: false, day: null },
      { header: false, day: null },
      { header: false, day: 'Today' },
      { header: false, day: null },
    ];

    const items = foldTicketRuns(lines, metas);

    expect(items.map((item) => item.kind)).toEqual(['line', 'line', 'line', 'line']);
  });

  it('counts created and moved apart and names the latest state of each ticket', () => {
    const lines = [
      created(1, 'FR-1'),
      created(2, 'FR-2'),
      moved(3, 'FR-15', 'in_progress'),
      moved(4, 'FR-15', 'done'),
      moved(5, 'FR-16', 'in_progress'),
    ];

    const [item] = foldTicketRuns(lines, quiet(lines));

    expect(item?.kind === 'fold' && item.fold.summary).toBe(
      '2 tickets moved · 2 created: FR-15 Done, FR-16 In progress',
    );
  });

  it('names at most three tickets and counts the rest', () => {
    const lines = ['A', 'B', 'C', 'D', 'E'].map((id, i) => moved(i, `FR-${id}`, 'done'));

    const [item] = foldTicketRuns(lines, quiet(lines));

    expect(item?.kind === 'fold' && item.fold.summary).toBe(
      '5 tickets moved: FR-A Done, FR-B Done, FR-C Done, +2',
    );
  });

  it('keeps the key when a fourth line is appended', () => {
    const three = [created(1, 'FR-1'), created(2, 'FR-2'), created(3, 'FR-3')];
    const four = [...three, created(4, 'FR-4')];

    const [before] = foldTicketRuns(three, quiet(three));
    const [after] = foldTicketRuns(four, quiet(four));

    expect(before?.kind === 'fold' && before.fold.key).toBe('e1');
    expect(after?.kind === 'fold' && after.fold.key).toBe('e1');
    expect(after?.kind === 'fold' && after.fold.lines).toHaveLength(4);
  });
});
