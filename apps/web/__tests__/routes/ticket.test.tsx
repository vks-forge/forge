/**
 * Pins: the Ticket page shows the ticket (gates under Details, runs under Runs), streams the current run's
 * thread (messages, collapsed tool calls, decisions, status), surfaces the Worker's question
 * in amber, answers it optimistically with recovery on refusal, and handles a lost stream.
 *
 * Why: this is where a person unblocks work. A question that is easy to miss, an answer that
 *   vanishes when the network blips, or a stream that dies silently would leave a Worker
 *   parked with nobody knowing.
 * Depends on: the stubbed Forge server and scripted run streams via helpers/render-app,
 *   routes/ticket/*, components/thread/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, networkDown, refusal } from '#tests/helpers/fetch-stub.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const ticketPath = (id: string) => `/p/sample-service/tickets/${id}`;

describe('Ticket page', () => {
  it('shows the header and the pull request; gates and runs live in their own tabs', async () => {
    const user = userEvent.setup();
    renderApp({ path: ticketPath('SVC-8') });

    expect(
      await screen.findByRole('heading', { level: 1, name: /Reject oversized uploads/ }),
    ).toBeInTheDocument();

    expect(
      within(screen.getByRole('main')).getByRole('link', { name: /Board/ }),
    ).toHaveAttribute('href', '/p/sample-service/board');

    await user.click(screen.getByRole('tab', { name: 'Details' }));
    expect(await screen.findByText('1 time')).toBeInTheDocument();

    const gates = within(await screen.findByRole('region', { name: 'Gates' }));
    expect(gates.getByText('G1')).toBeInTheDocument();
    expect(gates.getByText('failed')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Runs' }));
    const runs = within(await screen.findByRole('region', { name: 'Runs' }));
    expect(runs.getAllByRole('link')).toHaveLength(2);
    expect(runs.getByText(/retry of/)).toBeInTheDocument();
  });

  it('links the pull request out in a new tab from Details', async () => {
    renderApp({ path: `${ticketPath('SVC-5')}/details` });

    const pr = await screen.findByRole('link', { name: /#47/ });

    expect(pr).toHaveAttribute('href', expect.stringContaining('/pull/47'));
    expect(pr).toHaveAttribute('target', '_blank');
    expect(pr).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('links the tickets a blocked ticket waits on', async () => {
    renderApp({ path: ticketPath('SVC-9') });

    const link = await screen.findByRole('link', { name: 'SVC-5' });

    expect(link).toHaveAttribute('href', ticketPath('SVC-5'));
  });

  it('says so for a ticket that does not exist', async () => {
    renderApp({ path: ticketPath('SVC-999') });

    expect(await screen.findByText('There is no ticket SVC-999')).toBeInTheDocument();
  });

  it('streams a finished run: messages, a collapsed tool call that expands, decisions, end', async () => {
    const user = userEvent.setup();
    renderApp({ path: ticketPath('SVC-1') });

    const log = await screen.findByRole('log', { name: 'Worker messages' });
    expect(
      await within(log).findByText(/Sends now retry three times/),
    ).toBeInTheDocument();

    expect(within(log).getByText(/Reading the request for SVC-1/)).toBeInTheDocument();
    expect(within(log).getByText('Allowed')).toBeInTheDocument();
    expect(await screen.findByText('Worker run 1 finished')).toBeInTheDocument();
    expect(screen.queryByText(/Run ended/)).not.toBeInTheDocument();

    const read = within(log).getByRole('button', { name: /Read/ });
    expect(read).toHaveAttribute('aria-expanded', 'false');
    expect(within(log).queryByText('Output')).not.toBeInTheDocument();
    await user.click(read);
    expect(read).toHaveAttribute('aria-expanded', 'true');
    expect(within(log).getAllByText(/windowFor/).length).toBeGreaterThan(0);
  });

  it('shows a live run as live, with a denied tool and a failed call in red', async () => {
    renderApp({ path: ticketPath('SVC-3') });

    const log = await screen.findByRole('log', { name: 'Worker messages' });

    expect(await within(log).findByText('Denied')).toBeInTheDocument();
    expect(await within(log).findByRole('button', { name: /Edit/ })).toBeInTheDocument();
    expect(within(log).getAllByText('failed').length).toBeGreaterThan(0);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.queryByText(/Run ended/)).not.toBeInTheDocument();
  });

  it('switches the thread to another run of the ticket from the Runs tab, via ?run=', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: ticketPath('SVC-8') });
    await screen.findByText(/The Worker process exited unexpectedly/);

    await user.click(screen.getByRole('tab', { name: 'Runs' }));
    const runs = within(await screen.findByRole('region', { name: 'Runs' }));
    await user.click(runs.getByText('run-svc-8a'));

    expect(await screen.findByText('This run recorded no messages.')).toBeInTheDocument();
    expect(screen.queryByText(/exited unexpectedly/)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`${ticketPath('SVC-8')}/conversation`);
    expect(router.state.location.search).toBe('?run=run-svc-8a');
  });
});

describe('answering the Worker', () => {
  it('shows the question prominently and removes it at once when answered', async () => {
    const user = userEvent.setup();
    renderApp({ path: ticketPath('SVC-4') });
    await openNeedsYou(userEvent.setup());

    expect(
      await screen.findByText(/Question: the Worker needs your answer/),
    ).toBeInTheDocument();

    const box = screen.getByLabelText('Your answer');
    const send = screen.getByRole('button', { name: 'Send answer' });
    expect(send).toBeDisabled();

    await user.type(box, 'Use the account time zone');
    await user.click(send);

    await waitFor(() =>
      expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument(),
    );

    expect(await screen.findByText(/Answer sent/)).toBeInTheDocument();
  });

  it('brings the question back with the typed answer when the server refuses', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: ticketPath('SVC-4'),
      routes: { 'POST /interactions/:id/answer': networkDown },
    });

    await openNeedsYou(userEvent.setup());

    await user.type(await screen.findByLabelText('Your answer'), 'Use UTC');
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(await screen.findByText(/Your answer was not sent/)).toBeInTheDocument();
    expect(await screen.findByLabelText('Your answer')).toHaveValue('Use UTC');
    expect(forge.stub.callsTo('POST /interactions/:id/answer')).toMatchObject([
      { path: '/interactions/int-svc-4/answer', body: { answer: 'Use UTC' } },
    ]);
  });

  it('explains a 409 instead of inviting a pointless retry', async () => {
    const user = userEvent.setup();
    renderApp({
      path: ticketPath('SVC-4'),
      routes: {
        'POST /interactions/:id/answer': refusal(409, 'not_pending', 'not pending'),
      },
    });

    await openNeedsYou(userEvent.setup());

    await user.type(await screen.findByLabelText('Your answer'), 'x');
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(await screen.findByText(/already answered/)).toBeInTheDocument();
  });
});

describe('a lost or noisy stream', () => {
  it('says reconnecting, then live again, and offers Reconnect after a failure', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: ticketPath('SVC-3') });
    await screen.findByRole('log', { name: 'Worker messages' });
    expect(await screen.findByText('Live')).toBeInTheDocument();
    const [first] = forge.streams.sources;

    // The browser gives up, and Forge then refuses the new stream ticket.
    forge.stub.use({ 'POST /auth/sse-ticket': refusal(403, 'forbidden') });
    first!.drop();
    expect(await screen.findByText(/Connection lost, reconnecting/)).toBeInTheDocument();

    const reconnect = await screen.findByRole('button', { name: 'Reconnect' });
    forge.stub.use({
      'POST /auth/sse-ticket': json({ ticket: 'fresh', expires_in_s: 60 }),
    });

    await user.click(reconnect);

    await waitFor(() => expect(forge.streams.sources).toHaveLength(2));
    expect(await screen.findByText('Live')).toBeInTheDocument();
  });

  it('skips an unreadable message with a notice and keeps the stream', async () => {
    const { forge } = renderApp({ path: ticketPath('SVC-3') });
    expect(await screen.findByText('Live')).toBeInTheDocument();

    forge.streams.sources[0]!.emit('text', { not: 'a run event' });

    expect(
      await screen.findByText(/could not be read and was skipped/),
    ).toBeInTheDocument();

    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('closes the stream when the user leaves the page', async () => {
    const { forge, unmount } = renderApp({ path: ticketPath('SVC-3') });
    await waitFor(() => expect(forge.streams.sources).toHaveLength(1));

    unmount();

    expect(forge.streams.sources[0]!.closed).toBe(true);
  });
});
