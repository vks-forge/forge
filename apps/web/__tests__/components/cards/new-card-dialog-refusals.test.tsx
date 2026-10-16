/**
 * Pins: the New card popup sends the chosen type, priority, dependencies and links; offers open
 * cards only as dependencies; refuses a card on both lists and links that are not web
 * addresses; names the cards of a dependency loop and keeps the typed text; files one card on
 * a double click; and keeps one `dedupe_key` per opening, across retries.
 *
 * Why: a double click that files two cards starts two plans, a refusal that loses a long
 *   description makes the user retype it, and a loop message that does not name the cards
 *   leaves them guessing which dependency to remove.
 * Depends on: the stubbed Forge server via helpers/render-app, components/cards/*.
 */

import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose } from '#tests/helpers/choose.js';
import { networkDown, sequence } from '#tests/helpers/fetch-stub.js';
import type { StubRequest, StubResponse } from '#tests/helpers/fetch-stub.js';
import {
  BOARD,
  CREATE,
  UUID,
  created,
  createButton,
  fill,
  openPopup,
} from '#tests/helpers/new-card-popup.js';
import { locationOf, renderApp } from '#tests/helpers/render-app.js';

describe('New card popup: dependencies, links and refusals', () => {
  it('sends the chosen type, priority, dependencies and links', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: BOARD });
    await openPopup(user);
    await fill(user);

    await choose(user, 'Type', 'Issue');
    await choose(user, 'Priority', 'High');

    await user.click(screen.getByRole('combobox', { name: 'Depends on' }));
    await user.click(await screen.findByRole('option', { name: /FG-C4/ }));
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('combobox', { name: 'Blocks' }));
    await user.click(await screen.findByRole('option', { name: /FG-C2/ }));
    await user.keyboard('{Escape}');

    await user.type(screen.getByLabelText('Links'), 'https://example.com/issue/7');
    await user.click(screen.getByRole('button', { name: 'Add link' }));
    expect(
      within(screen.getByRole('list', { name: 'Added links' })).getByText(
        'https://example.com/issue/7',
      ),
    ).toBeInTheDocument();

    await user.click(createButton());

    await waitFor(() => expect(forge.stub.callsTo(CREATE)).toHaveLength(1));
    expect(forge.stub.callsTo(CREATE)[0]?.body).toMatchObject({
      type: 'issue',
      priority: 'high',
      depends_on: ['FG-C4'],
      blocks: ['FG-C2'],
      links: ['https://example.com/issue/7'],
    });
  });

  it('offers open cards only as dependencies', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD });
    await openPopup(user);

    await user.click(screen.getByRole('combobox', { name: 'Depends on' }));

    expect(await screen.findByRole('option', { name: /FG-C4/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /FG-C2/ })).toBeInTheDocument();
    // FG-C5 is done and FG-C6 is closed: neither can hold new work up.
    expect(screen.queryByRole('option', { name: /FG-C5/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /FG-C6/ })).not.toBeInTheDocument();
  });

  it('refuses a card that would both wait for and block the same card', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD });
    await openPopup(user);
    await fill(user);

    for (const name of ['Depends on', 'Blocks']) {
      await user.click(screen.getByRole('combobox', { name }));
      await user.click(await screen.findByRole('option', { name: /FG-C4/ }));
      await user.keyboard('{Escape}');
    }

    expect(await screen.findByText(/cannot both wait for this card/)).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
  });

  it('refuses a link that is not a web address and keeps what was typed', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD });
    await openPopup(user);

    await user.type(screen.getByLabelText('Links'), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Add link' }));

    expect(screen.getByText('A link must start with http:// or https://.')).toBeVisible();
    expect(screen.getByLabelText('Links')).toHaveValue('javascript:alert(1)');
    expect(screen.queryByRole('list', { name: 'Added links' })).not.toBeInTheDocument();
  });

  it('removes a link from the list', async () => {
    const user = userEvent.setup();
    renderApp({ path: BOARD });
    await openPopup(user);

    await user.type(screen.getByLabelText('Links'), 'https://example.com/a{Enter}');
    expect(screen.getByRole('list', { name: 'Added links' })).toBeInTheDocument();
    // Enter adds the link; it must not have sent the half-written card.
    expect(screen.getByRole('dialog', { name: 'New card' })).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Remove link https://example.com/a' }),
    );

    expect(screen.queryByRole('list', { name: 'Added links' })).not.toBeInTheDocument();
  });

  it('names the cards in a dependency loop and keeps everything typed', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({
      path: BOARD,
      routes: {
        [CREATE]: {
          status: 409,
          body: {
            error: {
              code: 'dependency_cycle',
              message: 'dependency cycle',
              cycle: ['FG-C3', 'FG-C4', 'FG-C3'],
            },
          },
        },
      },
    });

    await openPopup(user);
    await fill(user);
    await user.click(createButton());

    expect(await screen.findByText(/FG-C3 → FG-C4 → FG-C3/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New card' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Retry failed webhooks');
    expect(createButton()).toBeEnabled();
    expect(locationOf(router)).toBe(BOARD);
  });

  it('says a picked card no longer exists when the server cannot find it', async () => {
    const user = userEvent.setup();
    renderApp({
      path: BOARD,
      routes: {
        [CREATE]: {
          status: 404,
          body: { error: { code: 'card_not_found', message: 'No card FG-C4.' } },
        },
      },
    });

    await openPopup(user);
    await fill(user);
    await user.click(createButton());

    expect(await screen.findByText(/no longer exists/)).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveValue(
      'Failed webhook sends should retry with backoff, three times.',
    );
  });

  it('files one card when Create is clicked twice', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: BOARD });
    await openPopup(user);
    await fill(user);

    forge.stub.use({
      [CREATE]: (request: StubRequest) => ({ ...created(request), delayMs: 200 }),
    });

    await user.dblClick(createButton());
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New card' })).toBeNull(),
    );

    expect(forge.stub.callsTo(CREATE)).toHaveLength(1);
  });

  it('sends the same dedupe_key when a failed create is retried', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: BOARD });
    await openPopup(user);
    await fill(user);

    forge.stub.use({
      [CREATE]: (() => {
        const next = sequence(networkDown, { status: 201, body: {} });

        return (request: StubRequest) => {
          const answer = next(request) as StubResponse;

          return 'networkError' in answer ? answer : created(request);
        };
      })(),
    });

    await user.click(createButton());
    expect(await screen.findByText(/Cannot reach Forge/)).toBeInTheDocument();

    await user.click(createButton());
    await waitFor(() => expect(forge.stub.callsTo(CREATE)).toHaveLength(2));

    const [first, second] = forge.stub.callsTo(CREATE);
    const key = (first?.body as { dedupe_key: string }).dedupe_key;
    expect(key).toMatch(UUID);
    expect((second?.body as { dedupe_key: string }).dedupe_key).toBe(key);
  });

  it('uses a new dedupe_key every time the popup is opened', async () => {
    const user = userEvent.setup();
    const { forge, router } = renderApp({ path: BOARD });

    for (let round = 0; round < 2; round += 1) {
      await openPopup(user);
      await fill(user, `Webhook retries ${round}`);
      await user.click(createButton());
      await waitFor(() => expect(forge.stub.callsTo(CREATE)).toHaveLength(round + 1));
      await act(async () => {
        await router.navigate(BOARD);
      });
    }

    const keys = forge.stub
      .callsTo(CREATE)
      .map((call) => (call.body as { dedupe_key: string }).dedupe_key);

    expect(new Set(keys).size).toBe(2);
  });
});
