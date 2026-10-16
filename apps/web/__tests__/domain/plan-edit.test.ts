/**
 * Pins: a draft equal to the plan sends nothing; only changed titles and priorities, removals and
 * (when the survivors are reordered) the new order are sent; an empty title or an empty plan
 * cannot be saved; moving at the ends does nothing.
 *
 * Why: every save writes a new plan version, so a request that repeats unchanged fields or an
 *   order that did not change would clutter the version list, and a blank title or a plan with
 *   every ticket removed would be refused by the server after the owner thought it was done.
 * Depends on: src/domain/plan-edit, src/schemas/plan. No IO.
 */

import { describe, expect, it } from 'vitest';
import {
  canSaveDraft,
  draftOf,
  editBody,
  moveDraft,
  patchDraft,
} from '#/domain/plan-edit.js';
import { PlanTicket } from '#/schemas/plan.js';

const tickets = ['t1', 't2', 't3'].map((key) =>
  PlanTicket.parse({ key, title: `Ticket ${key}` }),
);

describe('editBody', () => {
  it('is null when nothing changed', () => {
    expect(editBody(tickets, draftOf(tickets))).toBeNull();
  });

  it('sends only what changed', () => {
    const draft = patchDraft(
      patchDraft(draftOf(tickets), 't1', { title: ' New ' }),
      't2',
      {
        priority: 'urgent',
      },
    );

    expect(editBody(tickets, draft)).toEqual({
      tickets: [
        { key: 't1', title: 'New' },
        { key: 't2', priority: 'urgent' },
      ],
    });
  });

  it('sends the order only when the surviving tickets were reordered', () => {
    const moved = moveDraft(draftOf(tickets), 't3', -1);
    const removed = patchDraft(draftOf(tickets), 't2', { removed: true });

    expect(editBody(tickets, moved)).toEqual({ tickets: [], order: ['t1', 't3', 't2'] });
    expect(editBody(tickets, removed)).toEqual({
      tickets: [{ key: 't2', removed: true }],
    });
  });

  it('does not move past the ends', () => {
    const draft = draftOf(tickets);

    expect(moveDraft(draft, 't1', -1)).toBe(draft);
    expect(moveDraft(draft, 't3', 1)).toBe(draft);
  });
});

describe('canSaveDraft', () => {
  it('needs a change, titles and at least one ticket left', () => {
    const base = draftOf(tickets);

    expect(canSaveDraft(tickets, base)).toBe(false);
    expect(canSaveDraft(tickets, patchDraft(base, 't1', { title: '  ' }))).toBe(false);
    expect(canSaveDraft(tickets, patchDraft(base, 't1', { priority: 'high' }))).toBe(
      true,
    );

    const none = base.map((t) => ({ ...t, removed: true }));

    expect(canSaveDraft(tickets, none)).toBe(false);
  });
});
