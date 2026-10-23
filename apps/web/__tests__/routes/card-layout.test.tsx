/**
 * Pins: from 1280 px the chat is the main column and Plan, Tickets and Details sit in a rail
 * beside it (no Conversation tab; the rail opens on the plan while one exists and an explicit
 * tab in the address wins), the plan can be approved from the rail and from the dock while the
 * chat stays on screen; from 1024 to 1279 px the same views are tabs above the chat; below
 * 1024 px the chat is the page and the views open as a full-screen sheet that Esc or "Back to
 * chat" closes; the header is one row with the title, one status pill and the cost.
 *
 * Why: the owner could not read the plan and talk to the Director at once, and a stack of
 *   banners left the chat no room (d-0172, restoring d-0134). Each breakpoint is a different
 *   tree with different focus rules, so each needs its own pin: a sheet that cannot be closed
 *   from the keyboard, or a rail that unmounts the chat, would each undo the redesign.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   helpers/match-media, components/work/*, routes/card/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  dockItem,
  flowEvent,
  flowRoutes,
  FLOW_CARD,
  planFixture,
} from '#tests/helpers/flow-fixtures.js';
import { setMatchMedia } from '#tests/helpers/match-media.js';
import { NO_NEEDS_YOU, openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PAGE = `/p/sample-service/cards/${FLOW_CARD}`;

const RAIL = (query: string): boolean => query.includes('min-width: 1280px');
const SHEET = (query: string): boolean => query.includes('max-width: 1023px');

const withPlan = (over: Record<string, unknown> = {}) =>
  flowRoutes({
    detail: {
      phase: 'plan_ready',
      plan_version: 1,
      needs_you: true,
      column: 'needs_you',
      needs_you_detail: [
        dockItem('plan_approval', ['approve_plan', 'request_changes'], {
          title: 'Plan v1 needs your approval',
          items: ['Tier C path: packages/core'],
        }),
      ],
      ...over,
    },
    events: [
      flowEvent(0, 'user_message', { text: 'Retry failed webhooks' }),
      flowEvent(1, 'plan_ready', {
        version: 1,
        ticket_count: 3,
        auto_approve_eligible: false,
      }),
    ],
    plan: {
      versions: [{ version: 1, created_at: new Date().toISOString() }],
      current: planFixture(),
      floor: { pass: false, reasons: ['Tier C path: packages/core'] },
    },
  });

describe('Card page: layout by width', () => {
  it('keeps the header to one row: title, one status pill and the card menu', async () => {
    renderApp({ path: PAGE, routes: withPlan() });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /Retry failed webhook sends/,
      }),
    ).toBeInTheDocument();

    expect(screen.getByText('Needs you')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Card actions' })).toBeInTheDocument();
  });

  describe('from 1280 px: the rail', () => {
    it('shows the chat and the plan side by side, with no Conversation tab', async () => {
      setMatchMedia(RAIL);
      renderApp({ path: PAGE, routes: withPlan() });

      const rail = await screen.findByRole('complementary', { name: 'Plan and details' });
      const strip = within(rail).getByRole('tablist', { name: 'Card' });

      expect(
        within(strip)
          .getAllByRole('tab')
          .map((tab) => tab.textContent),
      ).toEqual(['Plan', 'Tickets0', 'History', 'Details']);

      // The chat and the plan are on screen together.
      expect(screen.getByRole('log', { name: 'Conversation' })).toBeInTheDocument();
      expect(
        await within(rail).findByText('Retry failed webhook sends with backoff'),
      ).toBeInTheDocument();

      expect(screen.getByLabelText('Message the Director')).toBeInTheDocument();
    });

    it('puts the approval reasons at the top of the Plan', async () => {
      setMatchMedia(RAIL);
      renderApp({ path: PAGE, routes: withPlan() });

      const rail = await screen.findByRole('complementary', { name: 'Plan and details' });
      const reasons = await within(rail).findByRole('list', { name: 'Floor reasons' });
      const body = within(rail).getByText('Retry failed webhook sends with backoff');

      expect(
        reasons.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('lets an explicit tab in the address win over the default', async () => {
      setMatchMedia(RAIL);
      renderApp({ path: `${PAGE}/details`, routes: withPlan() });

      const rail = await screen.findByRole('complementary', { name: 'Plan and details' });

      expect(
        await within(rail).findByRole('region', { name: 'Cost' }),
      ).toBeInTheDocument();

      expect(screen.getByRole('log', { name: 'Conversation' })).toBeInTheDocument();
    });

    it('approves the plan from the rail while the chat stays on screen', async () => {
      setMatchMedia(RAIL);
      const user = userEvent.setup();
      const { forge } = renderApp({ path: PAGE, routes: withPlan() });

      const rail = await screen.findByRole('complementary', { name: 'Plan and details' });
      await user.click(await within(rail).findByRole('button', { name: 'Approve plan' }));
      const dialog = await screen.findByRole('alertdialog');

      expect(screen.getByRole('log', { name: 'Conversation' })).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Approve plan' }));

      await waitFor(() =>
        expect(forge.stub.callsTo('POST /cards/:id/plan/approve')).toHaveLength(1),
      );
    });

    it('approves the plan from the dock while the plan is open in the rail', async () => {
      setMatchMedia(RAIL);
      const user = userEvent.setup();
      const { forge } = renderApp({ path: PAGE, routes: withPlan() });

      const dock = await openNeedsYou(user, 'Waiting on you (1)');
      await user.click(within(dock).getByRole('button', { name: 'Approve plan…' }));
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'Approve plan',
        }),
      );

      await waitFor(() =>
        expect(forge.stub.callsTo('POST /cards/:id/plan/approve')).toHaveLength(1),
      );
    });

    it('opens the plan in the rail from the chat record without leaving the chat', async () => {
      setMatchMedia(RAIL);
      const user = userEvent.setup();
      const { router } = renderApp({ path: `${PAGE}/details`, routes: withPlan() });

      await user.click(await screen.findByRole('button', { name: 'Open plan →' }));

      expect(router.state.location.pathname).toBe(`${PAGE}/plan`);
      expect(screen.getByRole('log', { name: 'Conversation' })).toBeInTheDocument();
    });
  });

  describe('from 1024 to 1279 px: tabs above the chat', () => {
    it('keeps the Conversation as the first tab with the alert under the title', async () => {
      const user = userEvent.setup();
      renderApp({ path: PAGE, routes: withPlan() });

      const strip = await screen.findByRole('tablist', { name: 'Card' });

      expect(within(strip).getAllByRole('tab')[0]).toHaveTextContent('Conversation');
      expect(
        screen.queryByRole('complementary', { name: 'Plan and details' }),
      ).toBeNull();

      const alert = await screen.findByRole('button', NO_NEEDS_YOU);
      const box = screen.getByLabelText('Message the Director');

      // The alert sits under the title, before the chat; it takes no room above the box.
      expect(
        alert.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      expect(await openNeedsYou(user, 'Waiting on you (1)')).toBeVisible();
    });
  });

  describe('below 1024 px: the sheet', () => {
    it('shows only the chat until the header button opens Plan and details as a sheet', async () => {
      setMatchMedia(SHEET);
      const user = userEvent.setup();
      const { router } = renderApp({ path: PAGE, routes: withPlan() });

      expect(
        await screen.findByRole('log', { name: 'Conversation' }),
      ).toBeInTheDocument();

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('tablist', { name: 'Card' })).toBeNull();

      await user.click(screen.getByRole('link', { name: 'Plan and details' }));

      const sheet = await screen.findByRole('dialog');

      expect(router.state.location.pathname).toBe(`${PAGE}/plan`);
      expect(
        within(sheet).getByRole('button', { name: 'Approve plan' }),
      ).toBeInTheDocument();

      expect(
        within(sheet).getByRole('button', { name: /Back to chat/ }),
      ).toBeInTheDocument();
    });

    it('closes with Escape and returns to the chat', async () => {
      setMatchMedia(SHEET);
      const user = userEvent.setup();
      const { router } = renderApp({ path: `${PAGE}/plan`, routes: withPlan() });

      await screen.findByRole('dialog');
      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(router.state.location.pathname).toBe(`${PAGE}/conversation`);
      expect(screen.getByRole('log', { name: 'Conversation' })).toBeInTheDocument();
    });

    it('closes from Back to chat', async () => {
      setMatchMedia(SHEET);
      const user = userEvent.setup();
      renderApp({ path: `${PAGE}/tickets`, routes: withPlan() });

      const sheet = await screen.findByRole('dialog');
      await user.click(within(sheet).getByRole('button', { name: /Back to chat/ }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
  });
});
