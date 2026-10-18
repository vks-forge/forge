/**
 * Pins: memory search: typing searches after a pause (Enter at once, one letter never), `/` and
 * Esc, kind, status and tag chips and the superseded switch all held in the address, results as
 * plain text with `<mark>` highlights (a `<script>` statement shows literally), a replaced
 * decision shown as its successor, paging, and an explained state for loading, no matches,
 * error, offline and a project whose memory is still in files.
 *
 * Why: search is how the owner learns whether something was already decided. A result that
 * injects HTML, a search that fires per letter, a silent failure, or a filter that cannot be
 * shared by link each costs trust or time. Run over the stubbed Forge server, which answers in
 * the real reply shapes.
 * Depends on: routes/memory, the stubbed Forge server (helpers/fake-forge), renderScreens.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, networkDown, refusal } from '#tests/helpers/fetch-stub.js';
import { renderScreens } from '#tests/helpers/render-screens.js';

const PATH = '/p/sample-service/memory';
const SEARCH = 'GET /projects/:slug/memory/search';

const hit = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'decision',
  status: 'active',
  line: `Line of ${id}`,
  tags: [],
  why: 'statement',
  score: 1,
  ...extra,
});

const reply = (hits: unknown[], total = hits.length) =>
  json({ hits, total, truncated: false });

const box = () => screen.getByRole('searchbox', { name: 'Search memory' });

async function ready() {
  await screen.findByRole('heading', { name: 'Memory', level: 1 });
  await screen.findByRole('tablist', { name: 'Memory' });
}

afterEach(() => vi.restoreAllMocks());

describe('memory search', () => {
  it('searches after a pause, swaps the tabs for results and keeps the query in the address', async () => {
    const user = userEvent.setup();
    const { router, forge } = renderScreens(PATH);
    await ready();

    await user.type(box(), 'pnpm');
    const list = await screen.findByRole('list', { name: 'Search results' });

    expect(within(list).getByRole('link', { name: /Open d-0002/ })).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Memory' })).not.toBeInTheDocument();
    expect(router.state.location.search).toBe('?q=pnpm');
    expect(forge.stub.callsTo(SEARCH)).toHaveLength(1);
  });

  it('never searches on one letter and says how many it needs', async () => {
    const user = userEvent.setup();
    const { forge } = renderScreens(PATH);
    await ready();

    await user.type(box(), 'p');

    expect(
      await screen.findByText('Type at least 2 characters to search.'),
    ).toBeVisible();

    expect(screen.getByRole('tablist', { name: 'Memory' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(forge.stub.callsTo(SEARCH)).toHaveLength(0);
  });

  it('Enter searches at once, Esc clears and leaves search, and / focuses the box', async () => {
    const user = userEvent.setup();
    const { forge } = renderScreens(PATH);
    await ready();

    await user.keyboard('/');
    expect(box()).toHaveFocus();

    await user.type(box(), 'gates{Enter}');
    await waitFor(() => expect(forge.stub.callsTo(SEARCH)).toHaveLength(1), {
      timeout: 200,
    });

    await screen.findByRole('list', { name: 'Search results' });
    await user.keyboard('{Escape}');

    expect(box()).toHaveValue('');
    expect(await screen.findByRole('tablist', { name: 'Memory' })).toBeInTheDocument();
  });

  it('reads the query and every chip from the address and sends them to the server', async () => {
    const { forge } = renderScreens(
      `${PATH}?q=gates&kind=decision&status=active&tag=tests&superseded=1`,
    );

    await screen.findByRole('list', { name: 'Search results' });
    const path = forge.stub.callsTo(SEARCH)[0]!.path;

    expect(path).toContain('q=gates');
    expect(path).toContain('kind=decision');
    expect(path).toContain('status=active');
    expect(path).toContain('tag=tests');
    expect(path).toContain('superseded=1');
    expect(box()).toHaveValue('gates');
    expect(
      within(screen.getByRole('group', { name: 'Kind' })).getByRole('button', {
        name: 'Decision',
      }),
    ).toHaveAttribute('aria-pressed', 'true');

    expect(screen.getByRole('switch', { name: 'Include superseded' })).toBeChecked();
  });

  it('chips narrow the search and write themselves into the address', async () => {
    const user = userEvent.setup();
    const { router, forge } = renderScreens(`${PATH}?q=gates`);
    await screen.findByRole('list', { name: 'Search results' });

    await user.click(
      within(screen.getByRole('group', { name: 'Kind' })).getByRole('button', {
        name: 'Rejected approach',
      }),
    );

    await waitFor(() => expect(router.state.location.search).toContain('kind=rejected'));
    await waitFor(() =>
      expect(forge.stub.callsTo(SEARCH).at(-1)!.path).toContain('kind=rejected'),
    );

    const list = await screen.findByRole('list', { name: 'Search results' });

    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByRole('link', { name: /Open r-0002/ })).toBeInTheDocument();
  });

  it('draws a hostile statement and its marks as text, never as markup', async () => {
    const text = '<script>alert(1)</script> use pnpm';
    const { container } = renderScreens(`${PATH}?q=pnpm`, {
      routes: {
        [SEARCH]: reply([
          hit('d-0002', {
            line: text,
            snippet: {
              text,
              marks: [
                [text.length - 4, text.length],
                [-5, 3],
                [999, 1000],
              ],
            },
          }),
        ]),
      },
    });

    const row = await screen.findByRole('link', { name: /Open d-0002/ });

    expect(row).toHaveTextContent('<script>alert(1)</script> use pnpm');
    expect(container.querySelector('script')).toBeNull();
    const marks = container.querySelectorAll('mark');

    expect(Array.from(marks).map((m) => m.textContent)).toEqual(['<sc', 'pnpm']);
  });

  it('shows the active successor of a replaced decision and names the old one', async () => {
    const user = userEvent.setup();
    renderScreens(`${PATH}?q=full%20test%20suite`);

    const successor = await screen.findByRole('link', { name: /Open d-0006/ });
    const row = successor.closest('li') as HTMLElement;

    expect(within(row).getByText(/which matched your search/)).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'd-0003' })).toHaveAttribute(
      'href',
      '/p/sample-service/memory/d-0003',
    );

    await user.click(screen.getByRole('switch', { name: 'Include superseded' }));
    expect(await screen.findByRole('link', { name: /Open d-0003/ })).toBeInTheDocument();
  });

  it('reads long results in pages with Show more', async () => {
    const user = userEvent.setup();
    const all = Array.from({ length: 14 }, (_, i) =>
      hit(`d-${String(i + 1).padStart(4, '0')}`),
    );

    renderScreens(`${PATH}?q=many`, {
      routes: {
        [SEARCH]: ({ query }) => {
          const offset = Number(query.get('offset'));

          return {
            body: { hits: all.slice(offset, offset + 10), total: 14, truncated: false },
          };
        },
      },
    });

    const list = await screen.findByRole('list', { name: 'Search results' });

    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByText('14 matches')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(14));

    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('says there are no matches and clears the filters from there', async () => {
    const user = userEvent.setup();
    renderScreens(`${PATH}?q=zzzz&kind=rejected`);

    expect(await screen.findByText('No matches for “zzzz”')).toBeInTheDocument();
    expect(
      screen.getByText('Try fewer or different words, or clear the filters.'),
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    await waitFor(() =>
      expect(
        within(screen.getByRole('group', { name: 'Kind' })).getByRole('button', {
          name: 'Rejected approach',
        }),
      ).toHaveAttribute('aria-pressed', 'false'),
    );
  });

  it('explains a failed search and tries again', async () => {
    const user = userEvent.setup();
    let calls = 0;
    renderScreens(`${PATH}?q=gates`, {
      routes: {
        [SEARCH]: () => {
          calls += 1;

          return calls === 1
            ? { status: 500, body: { error: { code: 'boom', message: 'search broke' } } }
            : { body: { hits: [hit('d-0001')], total: 1, truncated: false } };
        },
      },
    });

    expect(await screen.findByText('Forge reported a problem')).toBeInTheDocument();
    expect(screen.getByText('search broke')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /Open d-0001/ })).toBeInTheDocument();
  });

  it('says Forge cannot be reached when the connection is down', async () => {
    renderScreens(`${PATH}?q=gates`, { routes: { [SEARCH]: networkDown } });

    expect(await screen.findByText('Cannot reach Forge')).toBeInTheDocument();
  });

  it('says it is offline instead of spinning forever', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderScreens(`${PATH}?q=gates`, { routes: { [SEARCH]: networkDown } });

    expect(await screen.findByText('You are offline')).toBeInTheDocument();
  });

  it('falls back to the word filter of the list for a project still on files', async () => {
    const user = userEvent.setup();
    renderScreens(`${PATH}?q=pnpm`, {
      routes: {
        [SEARCH]: refusal(409, 'memory_not_migrated', 'still on files'),
      },
    });

    expect(await screen.findByText(/Search is not available yet/)).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Memory' })).toBeInTheDocument();
    await user.click(await screen.findByRole('tab', { name: /Decisions/ }));

    expect(await screen.findByText('1 of 6 shown')).toBeInTheDocument();
  });
});
