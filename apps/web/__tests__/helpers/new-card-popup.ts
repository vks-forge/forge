/**
 * Helpers for the New card popup tests: open it, fill it, press Create, and stage the server's
 * 201 for a created card.
 *
 * Why: the popup tests are split across files by what they pin (the happy path and leaving,
 *   dependencies and links, refusals and retries), and each starts the same way. One set of
 *   helpers keeps them describing what a user does, not how the DOM is reached.
 *
 * Exports: BOARD, CREATE, UUID, openPopup(), fill(), createButton(), created().
 * Depends on: @testing-library/react, @testing-library/user-event, helpers/fetch-stub.
 */

import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { StubResponse } from '#tests/helpers/fetch-stub.js';

export const BOARD = '/p/sample-service/board';
export const CREATE = 'POST /projects/sample-service/cards';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function openPopup(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: 'New card' }));

  return screen.findByRole('dialog', { name: 'New card' });
}

export async function fill(
  user: UserEvent,
  title = 'Retry failed webhooks',
  description = 'Failed webhook sends should retry with backoff, three times.',
) {
  await user.type(screen.getByLabelText('Title'), title);
  await user.type(screen.getByLabelText('Description'), description);
}

/** The server's 201 for a created card, echoing the request. */
export function created(request: { body?: unknown }, id = 'FG-C7'): StubResponse {
  return {
    status: 201,
    body: {
      card: {
        ...(request.body as object),
        id,
        project: 'sample-service',
        summary: '',
        source: { kind: 'chat', ref: 'web' },
        created_by: { type: 'user', id: 'owner' },
        created_at: '2026-10-16T10:00:00.000Z',
        updated_at: '2026-10-16T10:00:00.000Z',
        ticket_count: 0,
        tickets_done: 0,
        column: 'shaping',
      },
    },
  };
}

export const createButton = () => screen.getByRole('button', { name: 'Create card' });
