/**
 * Pins: a fold shows its summary collapsed, its original lines expanded, and the button says
 * which state it is in; a note line keeps its ticket link, sentence and time in one paragraph.
 *
 * Why: the fold is the only way to read the ticket log once it is collapsed, so it must be a
 *   real disclosure (keyboard, screen reader). A note whose text wraps under its bullet, or
 *   whose link sits alone on a first line, is the broken layout the grid column fixes.
 * Depends on: components/card/chat-fold-line, components/card/chat-line-view. jsdom.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ChatFoldLine } from '#/components/card/chat-fold-line.js';
import { ChatLineView } from '#/components/card/chat-line-view.js';
import { lineOf } from '#/domain/card-chat.js';
import { foldTicketRuns } from '#/domain/chat-folds.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';

const ev = (seq: number, id: string): CardHistoryEvent => ({
  seq,
  kind: 'ticket_created',
  at: '2026-10-16T10:00:00.000Z',
  actor: { type: 'system', id: 'forge' },
  payload: { ticket_id: id, title: `Build the ${id} part of the importer` },
});

const lines = [1, 2, 3].map((n) => lineOf(ev(n, `FR-${n}`)));
const meta = { header: false, day: null } as const;

describe('ChatFoldLine', () => {
  it('is closed with a summary, then opens to the original lines', async () => {
    const user = userEvent.setup();
    const [item] = foldTicketRuns(lines, [meta, meta, meta]);

    if (item?.kind !== 'fold') {
      throw new Error('expected a fold');
    }

    render(
      <MemoryRouter>
        <ChatFoldLine
          fold={item.fold}
          slug="sample-service"
          meta={meta}
          first={false}
          onReviewPlan={() => undefined}
        />
      </MemoryRouter>,
    );

    const toggle = screen.getByRole('button', { name: /Show 3 updates/ });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('3 created');
    expect(screen.queryByRole('link', { name: 'FR-1' })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(screen.getByRole('button', { name: /Hide 3 updates/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    expect(screen.getByRole('link', { name: 'FR-1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'FR-3' })).toBeInTheDocument();
  });
});

describe('ChatLineView note', () => {
  it('keeps the ticket link and its sentence in one paragraph', () => {
    const [first] = lines;

    if (first === undefined) {
      throw new Error('expected a line');
    }

    render(
      <MemoryRouter>
        <ChatLineView
          line={first}
          slug="sample-service"
          onReviewPlan={() => undefined}
          meta={meta}
          first
        />
      </MemoryRouter>,
    );

    const paragraph = screen.getByRole('link', { name: 'FR-1' }).closest('p');

    expect(paragraph).toHaveTextContent(
      'FR-1 created: Build the FR-1 part of the importer',
    );

    expect(paragraph?.querySelector('time')).not.toBeNull();
  });
});
