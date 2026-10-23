/**
 * Pins: the Inbox has a Notices tab holding only items that need no decision, and "Mark all
 * read" there and in Unread sends one bulk request, says how many it marked and refreshes the list.
 *
 * Why: the owner should be able to read the news apart from the work that waits on them and clear
 *   it in one click. If the button were missing, ten budget notices would take ten clicks; if it
 *   ran in Needs action or gave no count, the owner could not tell what it did; if a refused
 *   request looked like success, news would stay unread while the owner believed it was cleared.
 * Depends on: routes/inbox/*, api/use-inbox, helpers/render-work.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWork } from '#tests/helpers/render-work.js';
import { inboxItem } from '#tests/helpers/work-fixtures.js';

const INBOX = '/p/sample-service/inbox';
const LIST = 'GET /projects/sample-service/inbox';
const COUNTS = 'GET /projects/sample-service/inbox/counts';
const READ_ALL = 'POST /projects/sample-service/inbox/read-all';

const QUESTION = inboxItem();
const GATE = (n: number) =>
  inboxItem({
    id: `gate_failed:${n}`,
    kind: 'gate_failed',
    title: `Gate G1 failed: ticket ${n}`,
    needs_action: false,
  });

/** A server that sorts items into views like the real one and remembers a bulk read. */
function server(over: Record<string, unknown> = {}) {
  let cleared = false;
  const all = () => [QUESTION, GATE(1), GATE(2)].map((i) => ({ ...i, read: cleared }));

  return {
    [LIST]: ({ query }: { query?: URLSearchParams }) => {
      const view = query?.get('view') ?? 'needs_action';
      const inView = (i: ReturnType<typeof all>[number]): boolean => {
        if (view === 'all') {
          return true;
        }

        if (view === 'needs_action') {
          return i.needs_action;
        }

        return view === 'notices' ? !i.needs_action : !i.read;
      };

      return { body: { items: all().filter(inView), nextCursor: null } };
    },
    [COUNTS]: () => ({
      body: {
        needs_action: 1,
        notices: 2,
        unread: cleared ? 0 : 3,
        all: 3,
        archived: 0,
      },
    }),
    [READ_ALL]: () => {
      cleared = true;

      return { body: { marked: 2 } };
    },
    ...over,
  };
}

describe('Inbox notices', () => {
  it('lists only items that need no decision under Notices, with a count', async () => {
    const user = userEvent.setup();
    renderWork(INBOX, server());

    expect(await screen.findByRole('tab', { name: /Notices/ })).toHaveTextContent('2');

    await user.click(screen.getByRole('tab', { name: /Notices/ }));

    expect(await screen.findByText('Gate G1 failed: ticket 1')).toBeInTheDocument();
    expect(screen.queryByText('Worker asks about migrations')).not.toBeInTheDocument();
  });

  it('marks every notice read with one request and says how many', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(INBOX, server());

    await user.click(await screen.findByRole('tab', { name: /Notices/ }));
    await user.click(await screen.findByRole('button', { name: 'Mark all read' }));

    expect(await screen.findByText('Marked 2 read')).toBeInTheDocument();
    expect(stub.callsTo(READ_ALL)).toHaveLength(1);
    expect(stub.callsTo(READ_ALL)[0]?.body).toEqual({ view: 'notices' });
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Mark all read' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('offers Mark all read in Unread, but not in Needs action', async () => {
    const user = userEvent.setup();
    const { stub } = renderWork(INBOX, server());

    await screen.findByText('Worker asks about migrations');

    expect(
      screen.queryByRole('button', { name: 'Mark all read' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Unread/ }));
    await user.click(await screen.findByRole('button', { name: 'Mark all read' }));

    await waitFor(() =>
      expect(stub.callsTo(READ_ALL)[0]?.body).toEqual({ view: 'unread' }),
    );
  });

  it('says so, and changes nothing on screen, when the server refuses', async () => {
    const user = userEvent.setup();
    renderWork(
      INBOX,
      server({
        [READ_ALL]: {
          status: 500,
          body: { error: { code: 'internal', message: 'boom' } },
        },
      }),
    );

    await user.click(await screen.findByRole('tab', { name: /Notices/ }));
    await user.click(await screen.findByRole('button', { name: 'Mark all read' }));

    expect(await screen.findByText('Could not mark them read')).toBeInTheDocument();
    expect(screen.getByText('Gate G1 failed: ticket 1')).toBeInTheDocument();
  });
});
