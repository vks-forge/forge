/**
 * Pins: when the OS asks for reduced motion, Board cards are drawn without the shared-layout
 * glide (`data-motion="instant"`), so a card that changes column simply appears in its new one.
 *
 * Why: cards gliding between columns is the headline motion of the Board (d-0132), and large
 *   movement is harmful to people with vestibular disorders, so honouring the setting is an
 *   accessibility floor. The motion library reads the preference once per page, so this case
 *   has its own file, like the other reduced-motion tests.
 * Depends on: the stubbed Forge server via helpers/render-app, components/list/windowed-list,
 *   helpers/match-media.
 */

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json } from '#tests/helpers/fetch-stub.js';
import { setMatchMedia } from '#tests/helpers/match-media.js';
import { renderApp } from '#tests/helpers/render-app.js';

describe('Board under reduced motion', () => {
  it('swaps cards instantly instead of gliding', async () => {
    setMatchMedia((query) => query.includes('prefers-reduced-motion'));

    renderApp({
      path: '/p/sample-service/board',
      routes: {
        'GET /projects/:slug/cards': json({
          items: [
            {
              id: 'FG-C1',
              project: 'sample-service',
              type: 'issue',
              title: 'Still',
              summary: '',
              source: { kind: 'chat', ref: 'web' },
              created_by: { type: 'user', id: 'owner' },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ticket_count: 0,
              tickets_done: 0,
              column: 'shaping',
              phase: 'grilling',
            },
          ],
          nextCursor: null,
        }),
      },
    });

    await screen.findByText('Still');

    expect(screen.getByRole('list', { name: 'Shaping cards' })).toHaveAttribute(
      'data-motion',
      'instant',
    );
  });
});
