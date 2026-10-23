/**
 * Pins: the phase chip says each phase in words, and the wait line links the tickets and card it
 * names.
 *
 * Why: "Queued" with "(CHE-3 is working)" is only useful if one click opens CHE-3; and the chip
 * must carry the word, not just a colour. These are the two pieces the Board, the card's Tickets
 * tab and the Ticket page all draw.
 * Depends on: components/ticket/phase-chip, @forge/core types.
 */

import type { TicketWait } from '@forge/core';
import { TicketPhase } from '@forge/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { PhaseChip, WaitLine } from '#/components/ticket/phase-chip.js';
import { phaseLabel } from '#/domain/ticket-phase-copy.js';

describe('PhaseChip', () => {
  it.each(TicketPhase.options)('draws %s as its words', (phase) => {
    render(<PhaseChip phase={phase} />);

    expect(screen.getByText(phaseLabel(phase))).toBeInTheDocument();
  });
});

describe('WaitLine', () => {
  const wait = {
    phase: 'waiting_slot',
    text: 'Waiting for a Worker slot (CHE-3 is working); CHE-C1 is re-planning',
    holders: ['CHE-3'],
    card_id: 'CHE-C1',
  } as TicketWait;

  it('links the holder to its ticket and the card to its page', () => {
    render(
      <MemoryRouter>
        <WaitLine wait={wait} slug="demo" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'CHE-3' })).toHaveAttribute(
      'href',
      '/p/demo/tickets/CHE-3',
    );

    expect(screen.getByRole('link', { name: 'CHE-C1' })).toHaveAttribute(
      'href',
      '/p/demo/cards/CHE-C1',
    );
  });

  it('still links a blocker the text does not mention', () => {
    render(
      <MemoryRouter>
        <WaitLine
          wait={
            {
              phase: 'waiting_deps',
              text: 'Waits for other tickets',
              blockers: ['CHE-2'],
            } as TicketWait
          }
          slug="demo"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'CHE-2' })).toBeInTheDocument();
  });
});
