/**
 * Pins: the Inbox lists items by view with counts, archives and marks instantly, puts an item
 * back with a plain message when the server refuses, offers Undo after an archive, pages with
 * "Load more", and the sidebar shows the unread count.
 *
 * Why: the Inbox is how the owner clears what waits on them. An archive that silently failed
 *   would hide a question the Worker is blocked on; an archive with no undo would make a
 *   mis-click costly; a badge that never refreshed would hide new work.
 * Depends on: routes/inbox/*, api/use-inbox, shell sidebar, helpers/render-work.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWork } from '#tests/helpers/render-work.js';
import { inboxItem } from '#tests/helpers/work-fixtures.js';

const INBOX = '/p/sample-service/inbox';
const LIST = 'GET /projects/sample-service/inbox';
const COUNTS = 'GET /projects/sample-service/inbox/counts';
const ARCHIVE = 'POST /projects/sample-service/inbox/question%3Aq-1/archive';
const UNARCHIVE = 'POST /projects/sample-service/inbox/question%3Aq-1/unarchive';

const QUESTION = inboxItem();
const REVIEW = inboxItem({
  id: 'ticket_review:SVC-5',
  kind: 'ticket_review',
  title: 'SVC-5 is ready for review',
  ticket_id: 'SVC-5',
  read: true,
  updated_at: '2026-10-16T08:00:00.000Z',
});

/** A server whose list forgets archived items, like the real one. */
function serverWith(items = [QUESTION, REVIEW]) {
  const archived = new Set<string>();

  return {
    [LIST]: () => ({
      body: { items: items.filter((i) => !archived.has(i.id)), nextCursor: null },
    }),
    [COUNTS]: { body: { needs_action: 2, unread: 1, all: 2, archived: 0 } },
    [ARCHIVE]: () => {
      archived.add(QUESTION.id);

      return { body: { ...QUESTION, archived: true } };
    },
    [UNARCHIVE]: () => {
      archived.delete(QUESTION.id);

      return { body: QUESTION };
    },
  };
}

describe('Inbox', () => {
  it('shows no date for a memory proposal dated at the epoch, never Jan 1, 1970', async () => {
    const proposal = inboxItem({
      id: 'memory_proposal:x-0001',
      kind: 'memory_proposal',
      title: 'Proposed memory: prefer pnpm',
      detail: 'A lesson learned',
      updated_at: '1970-01-01T00:00:00.000Z',
    });

    renderWork(INBOX, serverWith([proposal]));

    await screen.findByText('A lesson learned');

    expect(screen.queryByText(/1970/)).toBeNull();
  });

  it('lists items with a way to their source and counts on the tabs', async () => {
    renderWork(INBOX, serverWith());

    const list = await screen.findByRole('list', { name: 'Needs action' });
    expect(
      within(list).getByRole('link', {
        name: 'Open ticket: Worker asks about migrations',
      }),
    ).toHaveAttribute('href', '/p/sample-service/tickets/SVC-3');

    expect(screen.getByRole('tab', { name: /Needs action/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /Unread/ })).toHaveTextContent('1');
  });

  it('shows the unread count on the sidebar Inbox link', async () => {
    renderWork(INBOX, serverWith());

    const project = await screen.findByRole('navigation', { name: 'Project' });

    expect(
      await within(project).findByRole('status', { name: '1 unread in Inbox' }),
    ).toHaveTextContent('1');
  });

  it('archives an item at once and offers Undo, which unarchives it', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(INBOX, serverWith());

    await user.click(
      await screen.findByRole('button', {
        name: 'Archive: Worker asks about migrations',
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText('Worker asks about migrations')).not.toBeInTheDocument(),
    );

    expect(stub.callsTo(ARCHIVE)).toHaveLength(1);

    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByText('Worker asks about migrations')).toBeInTheDocument();
    expect(stub.callsTo(UNARCHIVE)).toHaveLength(1);
  });

  it('removes the item before the server has answered', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(INBOX, {
      ...serverWith(),
      [ARCHIVE]: { delayMs: 400, body: { ...QUESTION, archived: true } },
    });

    await user.click(
      await screen.findByRole('button', {
        name: 'Archive: Worker asks about migrations',
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText('Worker asks about migrations')).not.toBeInTheDocument(),
    );

    expect(screen.getByRole('tab', { name: /Needs action/ })).toHaveTextContent('1');
    expect(stub.callsTo(ARCHIVE)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('puts an item back and says so when the server refuses the archive', async () => {
    const user = userEvent.setup();
    renderWork(INBOX, {
      ...serverWith(),
      [ARCHIVE]: {
        status: 500,
        body: { error: { code: 'boom', message: 'disk is full' } },
      },
    });

    await user.click(
      await screen.findByRole('button', {
        name: 'Archive: Worker asks about migrations',
      }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not archive it');
    expect(alert).toHaveTextContent('disk is full');
    expect(screen.getByText('Worker asks about migrations')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Needs action/ })).toHaveTextContent('2');
  });

  it('marks an item unread and read', async () => {
    const user = userEvent.setup();
    let reviewRead = true;
    const { stub } = renderWork(INBOX, {
      ...serverWith(),
      [LIST]: () => ({
        body: { items: [QUESTION, { ...REVIEW, read: reviewRead }], nextCursor: null },
      }),
      'POST /projects/sample-service/inbox/ticket_review%3ASVC-5/unread': () => {
        reviewRead = false;

        return { body: { ...REVIEW, read: false } };
      },
    });

    await user.click(
      await screen.findByRole('button', {
        name: 'Mark unread: SVC-5 is ready for review',
      }),
    );

    expect(
      await screen.findByRole('button', { name: 'Mark read: SVC-5 is ready for review' }),
    ).toBeInTheDocument();

    expect(
      stub.callsTo('POST /projects/sample-service/inbox/ticket_review%3ASVC-5/unread'),
    ).toHaveLength(1);
  });

  it('loads the next page with the server cursor', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(INBOX, {
      ...serverWith(),
      [LIST]: (call) =>
        call.path.includes('cursor=c1')
          ? { body: { items: [REVIEW], nextCursor: null } }
          : { body: { items: [QUESTION], nextCursor: 'c1' } },
    });

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('SVC-5 is ready for review')).toBeInTheDocument();
    expect(stub.callsTo(LIST).some((c) => c.path.includes('cursor=c1'))).toBe(true);
  });

  it('says when nothing needs you, and how to see other views', async () => {
    renderWork(INBOX, {
      ...serverWith(),
      [LIST]: { body: { items: [], nextCursor: null } },
    });

    expect(await screen.findByText('Nothing in Needs action')).toBeInTheDocument();
  });

  it('explains a failed load and offers a retry', async () => {
    renderWork(INBOX, {
      ...serverWith(),
      [LIST]: {
        status: 500,
        body: { error: { code: 'boom', message: 'inbox exploded' } },
      },
    });

    expect(await screen.findByText('inbox exploded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
