/**
 * Pins: the Card page's Evidence tab shows the outside facts a plan can lean on, whether each
 * was checked (Verified or Unverified with the reason) and the quote behind it; the tab appears
 * only once research has left something to read; and it has loading, error with Retry, empty
 * and "research could not run" states. The source drawer has its own file.
 *
 * Why: the owner approves plans that may rest on facts a model read on the open web, and the
 *   page text is written by strangers. A claim shown as checked when it was not, or a stored
 *   page rendered as HTML, would let a hostile page vouch for itself or run script in the
 *   owner's session; an empty tab that does not say research was switched off would leave the
 *   owner guessing why a plan has no sources.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   helpers/research-fixtures, routes/card/tabs/evidence-tab, components/research/*.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { flowRoutes, FLOW_CARD } from '#tests/helpers/flow-fixtures.js';
import { renderApp } from '#tests/helpers/render-app.js';
import {
  evidenceReply,
  researchEvent,
  researchRoutes,
} from '#tests/helpers/research-fixtures.js';
import { refusal } from '#tests/helpers/fetch-stub.js';

const PAGE = `/p/sample-service/cards/${FLOW_CARD}`;
const EVIDENCE = `${PAGE}/evidence`;

const claim = (ref: string): HTMLElement => {
  const node = document.getElementById(`evidence-${ref}`);

  if (!node) {
    throw new Error(`no claim ${ref}`);
  }

  return node;
};

describe('Evidence tab: when it appears', () => {
  it('is absent until research has left something, then shows a count', async () => {
    renderApp({
      path: PAGE,
      routes: {
        ...flowRoutes(),
        ...researchRoutes({ evidence: [], sources: [], runs_used: 0 }),
      },
    });

    const strip = await screen.findByRole('tablist', { name: 'Card' });

    expect(within(strip).queryByRole('tab', { name: /Evidence/ })).toBeNull();
  });

  it('appears with the number of facts once evidence exists', async () => {
    renderApp({ path: PAGE, routes: { ...flowRoutes(), ...researchRoutes() } });

    const tab = await screen.findByRole('tab', { name: /Evidence/ });

    expect(tab).toHaveTextContent('3');
    expect(tab).toHaveAttribute('href', EVIDENCE);
  });

  it('appears when research ran but kept no fact, so its note can be read', async () => {
    renderApp({
      path: PAGE,
      routes: {
        ...flowRoutes({ events: [researchEvent(0, { claims: [] })] }),
        ...researchRoutes({ evidence: [], sources: [], runs_used: 1 }),
      },
    });

    expect(await screen.findByRole('tab', { name: /Evidence/ })).toBeInTheDocument();
  });
});

describe('Evidence tab: claims', () => {
  it('says how much of the research allowance is used and how many facts are unchecked', async () => {
    renderApp({ path: EVIDENCE, routes: { ...flowRoutes(), ...researchRoutes() } });

    expect(await screen.findByText(/Research used 2 of 4 runs/)).toBeInTheDocument();
    expect(screen.getByText(/3 facts, 1 unverified/)).toBeInTheDocument();
  });

  it('groups claims under their question and puts the rest under Other facts', async () => {
    renderApp({ path: EVIDENCE, routes: { ...flowRoutes(), ...researchRoutes() } });

    const group = await screen.findByRole('region', { name: 'What rate limit applies?' });

    expect(
      within(group).getByText(/allows 100 requests per minute per key/),
    ).toBeVisible();

    expect(within(group).getByText(/Bursts above 500/)).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Other facts' })).getByText(
        /Keys expire after ninety days/,
      ),
    ).toBeVisible();
  });

  it('marks each claim Verified or Unverified in words and gives the reason for the latter', async () => {
    renderApp({ path: EVIDENCE, routes: { ...flowRoutes(), ...researchRoutes() } });
    await screen.findByText(/allows 100 requests/);

    expect(within(claim('E1')).getByText('Verified')).toBeVisible();
    expect(within(claim('E3')).getByText('Verified')).toBeVisible();
    expect(within(claim('E2')).getByText('Unverified')).toBeVisible();
    expect(within(claim('E2')).getByText('No quote matched the page')).toBeVisible();
    expect(within(claim('E1')).queryByText('No quote matched the page')).toBeNull();
  });

  it('shows each source as domain, title and when it was read, and expands to the quote', async () => {
    const user = userEvent.setup();
    renderApp({ path: EVIDENCE, routes: { ...flowRoutes(), ...researchRoutes() } });
    await screen.findByText(/allows 100 requests/);

    const sources = within(
      within(claim('E1')).getByRole('list', { name: 'Sources for E1' }),
    );

    expect(sources.getByText('docs.example.com')).toBeVisible();
    expect(sources.getByText('API limits')).toBeVisible();
    expect(sources.getByText(/read /)).toBeVisible();
    expect(sources.queryByText('allows 100 requests per minute')).toBeNull();

    await user.click(sources.getByRole('button', { name: 'Show the quote' }));

    expect(sources.getByText('allows 100 requests per minute')).toBeVisible();
  });

  it('explains an unverified source instead of showing a quote', async () => {
    const user = userEvent.setup();
    renderApp({ path: EVIDENCE, routes: { ...flowRoutes(), ...researchRoutes() } });
    await screen.findByText(/Bursts above 500/);

    await user.click(within(claim('E2')).getByRole('button', { name: 'Why no quote' }));

    expect(
      within(claim('E2')).getByText(/could not be checked against it/),
    ).toBeVisible();
  });

  it('lists every page read, cited or not, with a note when its text was cut short', async () => {
    renderApp({ path: EVIDENCE, routes: { ...flowRoutes(), ...researchRoutes() } });

    const pages = await screen.findByRole('region', { name: 'Pages read' });

    expect(within(pages).getAllByRole('listitem')).toHaveLength(2);
    expect(within(pages).getByText(/cut short/)).toBeVisible();
  });
});

describe('Evidence tab: states', () => {
  it('shows a loading state while the evidence is on its way', async () => {
    renderApp({
      path: EVIDENCE,
      routes: {
        ...flowRoutes(),
        'GET /cards/:id/evidence': { body: evidenceReply(), delayMs: 150 },
      },
    });

    expect(
      await screen.findByRole('status', { name: 'Loading the evidence' }),
    ).toBeVisible();

    expect(await screen.findByText(/Research used 2 of 4 runs/)).toBeVisible();
  });

  it('offers a retry when the evidence cannot be loaded', async () => {
    const user = userEvent.setup();
    let failing = true;
    renderApp({
      path: EVIDENCE,
      routes: {
        ...flowRoutes(),
        'GET /cards/:id/evidence': () =>
          failing
            ? refusal(500, 'internal', 'The store is busy.')
            : { body: evidenceReply() },
      },
    });

    const retry = await screen.findByRole('button', { name: /Try again/ });
    failing = false;
    await user.click(retry);

    expect(await screen.findByText(/Research used 2 of 4 runs/)).toBeVisible();
  });

  it('says nothing was looked up when research has not run', async () => {
    renderApp({
      path: EVIDENCE,
      routes: {
        ...flowRoutes(),
        ...researchRoutes({ evidence: [], sources: [], runs_used: 0 }),
      },
    });

    expect(await screen.findByText('No facts were kept')).toBeVisible();
    expect(screen.getByText(/has not looked anything up on this card/)).toBeVisible();
    expect(screen.getByText(/Research used 0 of 4 runs/)).toBeVisible();
  });

  it('shows why research could not run and links to the setting to fix', async () => {
    const note =
      'Research is off, so nothing was looked up. Turn it on in Forge settings, Research.';

    renderApp({
      path: EVIDENCE,
      routes: {
        ...flowRoutes({
          events: [
            researchEvent(0, {
              searches: [],
              fetched: [],
              claims: [],
              unanswered: ['What rate limit applies?'],
              note,
            }),
          ],
        }),
        ...researchRoutes({ evidence: [], sources: [], runs_used: 1 }),
      },
    });

    const said = await screen.findByRole('region', { name: 'What research said' });

    expect(within(said).getByText(note)).toBeVisible();
    expect(
      within(said).getByRole('link', { name: 'Open Research settings' }),
    ).toHaveAttribute('href', '/settings/research');

    expect(screen.getByText(/kept no fact it could cite/)).toBeVisible();
  });
});
