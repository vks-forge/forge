/**
 * Pins: a sign-off card leads with the Director's recommendation and its evidence, taken from the
 * sign-off payload: "Recommend: sign off. All checks passed (3), 0 critical/high, matches the plan."
 * when everything passed and nothing was overruled, and "Recommend: look closer ..." with the
 * reason when a hold was overruled or the Director declined.
 *
 * Why: the owner signs the one step Forge cannot take back. Leading with a recommendation and the
 *   evidence behind it lets a clean sign-off be a quick decision and makes a doubtful one stand
 *   out before the owner reads on.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/escalation-world,
 *   helpers/finished-work-views, components/escalation/escalation-signoff.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { escalationWorld } from '#tests/helpers/escalation-world.js';
import { signOffView } from '#tests/helpers/finished-work-views.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const REVIEW = '/p/sample-service/tickets/SVC-4/review';

function open(view: Record<string, unknown>) {
  const world = escalationWorld([view], { ticketStatus: { 'SVC-4': 'review' } });

  return renderApp({ path: REVIEW, routes: world.routes });
}

describe('sign-off recommendation', () => {
  it('recommends signing off, with the evidence, when everything passed and nothing was overruled', async () => {
    open(
      signOffView('tier_b', {
        payload: {
          kind: 'sign_off',
          cause: 'tier_b',
          tier: 'B',
          summary: 'Report window is finished and every check passed.',
          checks: {
            passed: 3,
            counts: { critical: 0, high: 0, medium: 0, low: 0 },
            overrides: 0,
          },
        },
      }),
    );

    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', { name: 'Ready for your sign-off' });

    expect(
      within(card).getByText(
        'Recommend: sign off. All checks passed (3), 0 critical/high, matches the plan.',
      ),
    ).toBeVisible();
  });

  it('asks to look closer when a held finding was overruled and the Director declined', async () => {
    open(signOffView('director_declined'));
    await openNeedsYou(userEvent.setup());

    const card = await screen.findByRole('region', {
      name: 'The Director did not sign this off: it is yours',
    });

    expect(
      within(card).getByText(/^Recommend: look closer before signing off\./),
    ).toBeVisible();

    expect(within(card).getByText(/you overruled 1 held finding/)).toBeVisible();
    expect(within(card).getByText(/the Director did not sign it off/)).toBeVisible();
  });
});
