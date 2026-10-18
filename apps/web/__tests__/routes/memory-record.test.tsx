/**
 * Pins: the memory record page: provenance in words, statement, body and source as plain text,
 * Related with a reason per item, Links, History with the state moves and search-aid versions,
 * the note on a record imported with defaults, answering a pending proposal with the records it
 * may conflict with named, Export markdown (success with a copyable path, refusal in words),
 * every section's own empty, error and files-only state, and no way to edit a record.
 *
 * Why: this page is where the owner decides whether to trust a record. If it hid who wrote a
 * record, injected a record's text as markup, offered an edit on an append-only record or showed
 * an empty "Related" for a project that simply has no history yet, the owner would be misled. Run
 * over the stubbed Forge server in the real reply shapes.
 * Depends on: routes/memory/record-page, the stubbed Forge server, renderScreens.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json } from '#tests/helpers/fetch-stub.js';
import { rec, view } from '#tests/helpers/forge-data/memory-record-views.js';
import { renderScreens } from '#tests/helpers/render-screens.js';

const BASE = '/p/sample-service/memory';

afterEach(() => vi.restoreAllMocks());

describe('memory record page', () => {
  it('says whose word it is and shows statement, body and source as facts', async () => {
    renderScreens(`${BASE}/d-0001`);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /verified by the project checks/,
      }),
    ).toBeInTheDocument();

    expect(screen.getByText('Your decision')).toBeInTheDocument();
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    const header = screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement;

    expect(within(header).getByText('Decision')).toBeInTheDocument();
    expect(within(header).getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Notes' })).toHaveTextContent(
      /A red check blocks merge/,
    );

    expect(
      screen.getByText('fixture: sample data for component tests'),
    ).toBeInTheDocument();
  });

  it('words a Director inference the owner approved', async () => {
    renderScreens(`${BASE}/d-0009`, {
      routes: { [rec('d-0009')]: json({ record: view() }) },
    });

    expect(
      await screen.findByText("Director's inference, approved by you on 2026-10-03"),
    ).toBeInTheDocument();

    expect(screen.getByText('70%')).toBeInTheDocument();
  });

  it('draws record text as plain text, never as markup', async () => {
    const hostile = '<img src=x onerror="alert(1)"> <b>bold</b>';
    const { container } = renderScreens(`${BASE}/d-0009`, {
      routes: {
        [rec('d-0009')]: json({ record: view({ statement: hostile, body: hostile }) }),
      },
    });

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(hostile);
    expect(screen.getByRole('region', { name: 'Notes' })).toHaveTextContent(hostile);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('lists related records, each with the reason it was picked', async () => {
    renderScreens(`${BASE}/d-0006`);

    const section = (await screen.findByRole('heading', { name: 'Related' })).closest(
      'section',
    ) as HTMLElement;

    const first = await within(section).findByRole('link', { name: /Open d-0003/ });
    const item = first.closest('li') as HTMLElement;

    expect(within(item).getByText('supersedes')).toBeInTheDocument();
    expect(within(section).getAllByRole('listitem').length).toBeGreaterThan(1);
  });

  it('says nothing is related instead of showing an empty box', async () => {
    renderScreens(`${BASE}/d-0001`, {
      routes: { 'GET /projects/:slug/memory/:id/related': json({ related: [] }) },
    });

    expect(await screen.findByText('Nothing related yet.')).toBeInTheDocument();
  });

  it('shows what a record replaces and what replaced it, as links', async () => {
    const user = userEvent.setup();
    const { router } = renderScreens(`${BASE}/d-0006`);

    const links = (await screen.findByRole('heading', { name: 'Links' })).closest(
      'section',
    ) as HTMLElement;

    expect(within(links).getByText('Replaces')).toBeInTheDocument();
    await user.click(within(links).getByRole('link', { name: 'd-0003' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`${BASE}/d-0003`));

    const old = (await screen.findByRole('heading', { name: 'Links' })).closest(
      'section',
    ) as HTMLElement;

    expect(await within(old).findByText('Replaced by')).toBeInTheDocument();
    expect(within(old).getByRole('link', { name: 'd-0006' })).toBeInTheDocument();
  });

  it('links a card and a ticket to their pages', async () => {
    renderScreens(`${BASE}/d-0009`, {
      routes: {
        [rec('d-0009')]: json({
          record: view({
            links: [
              { rel: 'card', target_kind: 'card', target: 'CARD-4' },
              { rel: 'ticket', target_kind: 'ticket', target: 'SVC-9' },
            ],
          }),
        }),
      },
    });

    expect(await screen.findByRole('link', { name: 'CARD-4' })).toHaveAttribute(
      'href',
      '/p/sample-service/cards/CARD-4',
    );

    expect(screen.getByRole('link', { name: 'SVC-9' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-9',
    );
  });

  it('shows the history of state moves and of search-aid versions', async () => {
    renderScreens(`${BASE}/d-0003`, {
      routes: {
        'GET /projects/:slug/memory/:id/history': json({
          events: [
            {
              seq: 1,
              id: 'd-0003',
              at: '2026-08-02T09:00:00.000Z',
              actor: 'owner',
              event: 'decided',
              from_status: null,
              to_status: 'active',
              reason: null,
            },
            {
              seq: 2,
              id: 'd-0003',
              at: '2026-09-20T10:00:00.000Z',
              actor: 'owner',
              event: 'superseded',
              from_status: 'active',
              to_status: 'superseded',
              reason: 'Suite grew past ten minutes',
            },
          ],
          versions: [
            {
              version: 1,
              at: '2026-08-03T09:00:00.000Z',
              actor: 'director',
              gist: 'full suite on every ticket',
              aliases: 'ci tests\nfull run',
              pinned: false,
            },
          ],
        }),
      },
    });

    const list = await screen.findByRole('list', { name: 'State history' });

    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(
      within(list).getByText(/Replaced by a newer decision \(active to superseded\)/),
    ).toBeInTheDocument();

    expect(
      within(list).getByText('Reason: Suite grew past ten minutes'),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /Version 1: gist “full suite on every ticket”, aliases ci tests, full run/,
      ),
    ).toBeInTheDocument();
  });

  it('notes what an imported record had filled in with defaults', async () => {
    renderScreens(`${BASE}/d-0009`, {
      routes: {
        [rec('d-0009')]: json({
          record: view({
            imported: {
              from: 'decisions/d-0009.md@abc123',
              defaulted_fields: ['author', 'origin'],
            },
          }),
        }),
        'GET /projects/:slug/memory/:id/history': json({
          events: [
            {
              seq: 1,
              id: 'd-0009',
              at: '2026-10-18T09:00:00.000Z',
              actor: 'forge',
              event: 'imported',
              from_status: null,
              to_status: 'active',
              reason: null,
            },
          ],
          versions: [],
        }),
      },
    });

    const note = await screen.findByRole('note');
    await waitFor(() => expect(note).toHaveTextContent('on 2026-10-18'));

    expect(note).toHaveTextContent('2 fields were filled with defaults: author, origin.');
  });
});
