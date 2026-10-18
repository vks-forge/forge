/**
 * Pins: a budget warning leads to its card's Details tab (where the cap is), its card id is
 * read from the item id, and every inbox kind has a label.
 *
 * Why: the warning belongs to a card, not a ticket or a run, so the generic fallback ("open the
 *   Inbox") would send the owner in a circle. The card id lives only in the item id
 *   (`budget_warning:<card>:<threshold>`), so reading it once, here, keeps the row, the drawer
 *   and the link agreeing about which card a warning is for.
 * Depends on: domain/inbox-links. No DOM.
 */

import { INBOX_KINDS } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { budgetCardId, INBOX_KIND_LABEL, inboxLink } from '#/domain/inbox-links.js';

describe('budget warning links', () => {
  it('opens the card Details tab', () => {
    expect(
      inboxLink('svc', { id: 'budget_warning:SVC-C4:0.8', kind: 'budget_warning' }),
    ).toEqual({ to: '/p/svc/cards/SVC-C4/details', label: 'Open card' });
  });

  it('reads the card from the item id for either threshold, and only for a budget warning', () => {
    expect(budgetCardId({ id: 'budget_warning:SVC-C4:1', kind: 'budget_warning' })).toBe(
      'SVC-C4',
    );

    expect(budgetCardId({ id: 'question:q-1', kind: 'question' })).toBeUndefined();
  });

  it('falls back to the Inbox for an id it cannot read, never to a broken card link', () => {
    expect(inboxLink('svc', { id: 'budget_warning', kind: 'budget_warning' })).toEqual({
      to: '/p/svc/inbox',
      label: 'Open inbox',
    });
  });

  it('labels every kind the server can send', () => {
    for (const kind of INBOX_KINDS) {
      expect(INBOX_KIND_LABEL[kind]).toBeTruthy();
    }

    expect(INBOX_KIND_LABEL.budget_warning).toBe('Budget');
  });
});
