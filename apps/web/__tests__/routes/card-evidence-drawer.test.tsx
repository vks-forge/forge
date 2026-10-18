/**
 * Pins: the Evidence tab's source drawer shows a stored page as inert plain text with the
 * quote marked, shows where the page came from, offers a link out only for a real web address
 * (opened without an opener handle or referrer), works from the keyboard, and says so, with a
 * way to retry, when the page text cannot be read.
 *
 * Why: the page text is written by strangers. Rendered as HTML it would run script in the
 *   owner's session; with a clickable `javascript:` address or a live instruction aimed at the
 *   Director it would let a hostile page act on the owner. The drawer is where "Verified" is
 *   checked against the page, so it must show the page exactly as stored and never as markup.
 * Depends on: the stubbed Forge server via helpers/render-app, helpers/flow-fixtures,
 *   helpers/research-fixtures, components/research/source-drawer.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { refusal } from '#tests/helpers/fetch-stub.js';
import { flowRoutes, FLOW_CARD } from '#tests/helpers/flow-fixtures.js';
import { renderApp } from '#tests/helpers/render-app.js';
import {
  PAGE_TEXT,
  researchRoutes,
  SOURCE_S1,
} from '#tests/helpers/research-fixtures.js';

const EVIDENCE = `/p/sample-service/cards/${FLOW_CARD}/evidence`;

const claim = (ref: string): HTMLElement => {
  const node = document.getElementById(`evidence-${ref}`);

  if (!node) {
    throw new Error(`no claim ${ref}`);
  }

  return node;
};

describe('Evidence tab: the source drawer', () => {
  it('shows the stored page as plain text, never as markup, with the quote marked', async () => {
    const user = userEvent.setup();
    renderApp({ path: EVIDENCE, routes: { ...flowRoutes(), ...researchRoutes() } });
    await screen.findByText(/allows 100 requests/);

    await user.click(
      within(claim('E1')).getByRole('button', { name: /Open source S1: API limits/ }),
    );

    const page = await screen.findByLabelText('Stored page text');

    // The hostile bytes are on screen as characters, and nothing in them became an element.
    expect(page.textContent).toBe(PAGE_TEXT);
    expect(page.querySelector('script, a, img, iframe')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(window).not.toHaveProperty('pwned');

    const mark = page.querySelector('mark');

    expect(mark?.textContent).toBe('allows 100 requests per\nminute');
    expect(screen.getByText(/never followed/)).toBeVisible();
  });

  it('shows where the page came from and links out only as a safe external link', async () => {
    const user = userEvent.setup();
    renderApp({ path: EVIDENCE, routes: { ...flowRoutes(), ...researchRoutes() } });
    await screen.findByText(/allows 100 requests/);

    await user.click(
      within(claim('E1')).getByRole('button', { name: /Open source S1: API limits/ }),
    );

    const link = await screen.findByRole('link', { name: /Open the page on the web/ });

    expect(link).toHaveAttribute('href', 'https://www.docs.example.com/limits');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(screen.getByText('Fingerprint (sha256)')).toBeVisible();
    expect(screen.getByText('ab12cd34ef56')).toBeVisible();
    expect(screen.getByText('The Director')).toBeVisible();
  });

  it('never makes a link of an address that is not http or https', async () => {
    const user = userEvent.setup();
    renderApp({ path: EVIDENCE, routes: { ...flowRoutes(), ...researchRoutes() } });
    await screen.findByText(/Bursts above 500/);

    await user.click(
      within(claim('E2')).getByRole('button', { name: /Open source S2: A forum thread/ }),
    );

    expect(await screen.findByText(/not a web page link/)).toBeVisible();
    expect(screen.queryByRole('link', { name: /Open the page on the web/ })).toBeNull();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
    expect(screen.getByText('Cut short')).toBeVisible();
  });

  it('is reachable and operable from the keyboard, and Escape closes it', async () => {
    const user = userEvent.setup();
    renderApp({ path: EVIDENCE, routes: { ...flowRoutes(), ...researchRoutes() } });
    await screen.findByText(/allows 100 requests/);

    const open = within(claim('E1')).getByRole('button', {
      name: /Open source S1: API limits/,
    });

    open.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByLabelText('Stored page text')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByLabelText('Stored page text')).toBeNull());
  });

  it('says so with a way to retry when the page text cannot be read', async () => {
    const user = userEvent.setup();
    let failing = true;
    renderApp({
      path: EVIDENCE,
      routes: {
        ...flowRoutes(),
        ...researchRoutes(),
        'GET /cards/:id/sources/:ref': () =>
          failing
            ? refusal(500, 'internal', 'The store is busy.')
            : { body: { source: SOURCE_S1, text: PAGE_TEXT } },
      },
    });

    await screen.findByText(/allows 100 requests/);
    await user.click(
      within(claim('E1')).getByRole('button', { name: /Open source S1: API limits/ }),
    );

    const retry = await screen.findByRole('button', { name: /Try again/ });
    failing = false;
    await user.click(retry);

    expect(await screen.findByLabelText('Stored page text')).toBeInTheDocument();
  });
});
