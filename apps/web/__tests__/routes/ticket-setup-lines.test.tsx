/**
 * Pins: a `setup` gate row (the Worker's own lockfile change broke the install) is read and drawn
 * beside the gates like any other row, and the two card-log notes about a ticket's workspace ("ready
 * in 38 s", "setup skipped by owner") are drawn as quiet one-line notes in the card chat.
 *
 * Why: a ticket's checks can fail because packages could not be installed, not because the code is
 *   wrong, and the owner has to see that row by name (d-0180). The two notes are the card's whole
 *   record of what Forge did before a Worker started; a schema or a chat that dropped them would
 *   leave the owner guessing why a ticket sat in Planned.
 * Depends on: routes/ticket/ticket-side (GateStrip), schemas/tickets, domain/card-chat.
 */

import { GateResult } from '@forge/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { transcriptOf } from '#/domain/card-chat.js';
import { GateStrip } from '#/routes/ticket/ticket-side.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';

const row = (gate: string, status: string, id: number) =>
  GateResult.parse({
    id,
    run_id: 'run-1',
    gate,
    status,
    started_at: '2026-10-21T10:00:00.000Z',
  });

const note = (seq: number, text: string) =>
  ({
    seq,
    kind: 'note',
    at: '2026-10-21T10:00:00.000Z',
    actor: { type: 'engine', id: 'forge' },
    payload: { text },
  }) as unknown as CardHistoryEvent;

describe('setup gate row', () => {
  it('parses as a gate result and is drawn by name, failed, next to the gates', () => {
    render(<GateStrip results={[row('G1', 'passed', 1), row('setup', 'failed', 2)]} />);

    const strip = screen.getByRole('region', { name: 'Gates' });
    const setup = within(strip).getByText('setup').closest('li') as HTMLElement;

    expect(setup).toHaveTextContent('failed');
    expect(within(strip).getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('workspace notes in the card chat', () => {
  it('draws "workspace ready" and "setup skipped" as quiet notes with their words intact', () => {
    const lines = transcriptOf(
      [
        note(1, 'SVC-4 workspace ready in 38 s'),
        note(2, 'SVC-4 workspace: setup skipped by owner'),
      ],
      [],
    );

    expect(lines.map((line) => [line.tone, line.text])).toEqual([
      ['note', 'SVC-4 workspace ready in 38 s'],
      ['note', 'SVC-4 workspace: setup skipped by owner'],
    ]);
  });
});
