/**
 * Pins: a URL's tab segment resolves to a known tab or to the page's default, the old `?tab=`
 * value maps to its new tab, the Review tab exists only for review, sign-off and a held decision, and the tab
 * paths of cards and tickets are path segments (with `?run=` on a ticket).
 *
 * Why: the tab is the last segment of the Card and Ticket URLs. A mistyped or stale tab must
 *   land on the default view, and a ticket must never show Review when nothing waits on it.
 * Depends on: src/domain/route-tabs, card-paths, ticket-paths. Pure.
 */

import { describe, expect, it } from 'vitest';
import { cardPath } from '#/domain/card-paths.js';
import {
  CARD_TAB_IDS,
  TICKET_TAB_IDS,
  isReviewItem,
  legacyCardTab,
  resolveTab,
  ticketHasReview,
} from '#/domain/route-tabs.js';
import { ticketPath } from '#/domain/ticket-paths.js';

describe('resolveTab', () => {
  it('accepts a known tab', () => {
    expect(resolveTab('plan', CARD_TAB_IDS, 'conversation')).toEqual({
      tab: 'plan',
      known: true,
    });
  });

  it('falls back to the default for an unknown tab, and for none', () => {
    expect(resolveTab('nope', CARD_TAB_IDS, 'conversation')).toEqual({
      tab: 'conversation',
      known: false,
    });

    expect(resolveTab(undefined, TICKET_TAB_IDS, 'conversation').tab).toBe(
      'conversation',
    );
  });
});

describe('legacyCardTab', () => {
  it('maps the old names and ignores anything else', () => {
    expect(legacyCardTab('chat')).toBe('conversation');
    expect(legacyCardTab('tickets')).toBe('tickets');
    expect(legacyCardTab('review')).toBeNull();
    expect(legacyCardTab(null)).toBeNull();
  });
});

const item = (kind: 'decision' | 'sign_off' | 'failure', over: object = {}) =>
  ({ id: 'q-1', stage: 'owner', payload: { kind }, ...over }) as never;

const detailOf = (status: string, escalations: object[] = []) =>
  ({ ticket: { status }, escalations }) as never;

describe('ticketHasReview', () => {
  it('is true while the ticket waits on review or sign-off', () => {
    expect(ticketHasReview(detailOf('review'))).toBe(true);
    expect(ticketHasReview(detailOf('needs_signoff'))).toBe(true);
    expect(ticketHasReview(detailOf('in_progress'))).toBe(false);
    expect(ticketHasReview(detailOf('done'))).toBe(false);
  });

  it('is also true for a ticket held for a decision, which the owner must settle on that tab', () => {
    expect(ticketHasReview(detailOf('waiting_human', [item('decision')]))).toBe(true);
    expect(ticketHasReview(detailOf('waiting_human', [item('sign_off')]))).toBe(true);
  });

  it('ignores a failure, a settled decision and one the Director still looks at', () => {
    expect(ticketHasReview(detailOf('waiting_human', [item('failure')]))).toBe(false);

    expect(
      ticketHasReview(
        detailOf('waiting_human', [
          item('decision', { settled: { action: 'continue' } }),
        ]),
      ),
    ).toBe(false);

    expect(
      ticketHasReview(
        detailOf('waiting_human', [item('decision', { stage: 'director' })]),
      ),
    ).toBe(false);
  });
});

describe('isReviewItem', () => {
  it('names the two kinds the Review tab draws', () => {
    expect(isReviewItem(item('decision'))).toBe(true);
    expect(isReviewItem(item('sign_off'))).toBe(true);
    expect(isReviewItem(item('failure'))).toBe(false);
  });
});

describe('tab paths', () => {
  it('puts the tab and the run in the URL', () => {
    expect(cardPath('alpha', 'FX-C2')).toBe('/p/alpha/cards/FX-C2');
    expect(cardPath('alpha', 'FX-C2', 'plan')).toBe('/p/alpha/cards/FX-C2/plan');
    expect(ticketPath('alpha', 'FX-4', 'runs')).toBe('/p/alpha/tickets/FX-4/runs');
    expect(ticketPath('alpha', 'FX-4', 'conversation', 'run 1')).toBe(
      '/p/alpha/tickets/FX-4/conversation?run=run%201',
    );
  });
});
