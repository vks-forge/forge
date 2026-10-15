/**
 * Pins: the Ticket page shows the ticket, its gates and runs, streams the current run's
 * thread (messages, collapsed tool calls, decisions, status), surfaces the Worker's question
 * in amber, answers it optimistically with recovery on refusal, and handles a lost stream.
 *
 * Why: this is where a person unblocks work. A question that is easy to miss, an answer that
 *   vanishes when the network blips, or a stream that dies silently would leave a Worker
 *   parked with nobody knowing.
 * Depends on: the fake ticket server via helpers/render-app, routes/ticket/*, components/thread/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '#/api/api-error.js';
import { renderApp } from '#tests/helpers/render-app.js';
import type { ForgeApi } from '#/types/api.types.js';
import type { RunEventWatchOptions } from '#/types/sse.types.js';

const ticketPath = (id: string) => `/p/sample-service/tickets/${id}`;

describe('Ticket page', () => {
  it('shows the header, the pull request, gates and runs', async () => {
    renderApp({ path: ticketPath('SVC-8') });

    expect(
      await screen.findByRole('heading', { level: 1, name: /Reject oversized uploads/ }),
    ).toBeInTheDocument();

    const gates = within(screen.getByRole('region', { name: 'Gates' }));
    expect(gates.getByText('G1')).toBeInTheDocument();
    expect(gates.getByText('failed')).toBeInTheDocument();
    const runs = within(screen.getByRole('region', { name: 'Runs' }));
    expect(runs.getAllByRole('button')).toHaveLength(2);
    expect(runs.getByText(/retry of/)).toBeInTheDocument();
    expect(screen.getByText(/Reworked 1×/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: /Board/ }),
    ).toHaveAttribute('href', '/p/sample-service/board');
  });

  it('links the pull request out in a new tab', async () => {
    renderApp({ path: ticketPath('SVC-5') });

    const pr = await screen.findByRole('link', { name: /Pull request #47/ });

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
    expect(await screen.findByText(/Run ended \(success\)/)).toBeInTheDocument();

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

  it('switches the thread to another run of the ticket', async () => {
    const user = userEvent.setup();
    renderApp({ path: ticketPath('SVC-8') });
    await screen.findByText(/The Worker process exited unexpectedly/);

    const runs = within(screen.getByRole('region', { name: 'Runs' }));
    await user.click(runs.getByText('run-svc-8a'));

    expect(await screen.findByText('This run recorded no messages.')).toBeInTheDocument();
    expect(screen.queryByText(/exited unexpectedly/)).not.toBeInTheDocument();
  });
});

describe('answering the Worker', () => {
  it('shows the question prominently and removes it at once when answered', async () => {
    const user = userEvent.setup();
    renderApp({ path: ticketPath('SVC-4') });

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
    const answer = vi
      .fn()
      .mockRejectedValue(new ApiError('network', 'Cannot reach the Forge server.'));

    renderApp({
      path: ticketPath('SVC-4'),
      wrapApi: (api): ForgeApi => ({ ...api, interactions: { answer } }),
    });

    await user.type(await screen.findByLabelText('Your answer'), 'Use UTC');
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(await screen.findByText(/Your answer was not sent/)).toBeInTheDocument();
    expect(await screen.findByLabelText('Your answer')).toHaveValue('Use UTC');
    expect(answer).toHaveBeenCalledWith('int-svc-4', 'Use UTC');
  });

  it('explains a 409 instead of inviting a pointless retry', async () => {
    const user = userEvent.setup();
    const answer = vi
      .fn()
      .mockRejectedValue(
        new ApiError('http', 'not pending', { status: 409, code: 'not_pending' }),
      );

    renderApp({
      path: ticketPath('SVC-4'),
      wrapApi: (api): ForgeApi => ({ ...api, interactions: { answer } }),
    });

    await user.type(await screen.findByLabelText('Your answer'), 'x');
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(await screen.findByText(/already answered/)).toBeInTheDocument();
  });
});

describe('a lost or noisy stream', () => {
  function streamStub() {
    const handlers: RunEventWatchOptions[] = [];
    const close = vi.fn();
    const wrap = (api: ForgeApi): ForgeApi => ({
      ...api,
      runEvents: {
        watch: (options) => {
          handlers.push(options as RunEventWatchOptions);

          return { close };
        },
      },
    });

    return { handlers, close, wrap };
  }

  it('says reconnecting, then live again, and offers Reconnect after a failure', async () => {
    const user = userEvent.setup();
    const { handlers, wrap } = streamStub();
    renderApp({ path: ticketPath('SVC-3'), wrapApi: wrap });
    await screen.findByRole('log', { name: 'Worker messages' });
    await waitFor(() => expect(handlers).toHaveLength(1));
    const first = handlers[0]!;

    first.onConnection?.('open');
    expect(await screen.findByText('Live')).toBeInTheDocument();

    first.onConnection?.('reconnecting');
    expect(await screen.findByText(/Connection lost, reconnecting/)).toBeInTheDocument();

    first.onError(new ApiError('network', 'Lost the live connection to Forge.'));
    await user.click(await screen.findByRole('button', { name: 'Reconnect' }));

    await waitFor(() => expect(handlers).toHaveLength(2));
  });

  it('skips an unreadable message with a notice and keeps the stream', async () => {
    const { handlers, wrap } = streamStub();
    renderApp({ path: ticketPath('SVC-3'), wrapApi: wrap });
    await waitFor(() => expect(handlers).toHaveLength(1));

    handlers[0]!.onConnection?.('open');
    handlers[0]!.onError(new ApiError('payload', 'bad frame'));

    expect(
      await screen.findByText(/could not be read and was skipped/),
    ).toBeInTheDocument();

    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('closes the stream when the user leaves the page', async () => {
    const { handlers, close, wrap } = streamStub();
    const { unmount } = renderApp({ path: ticketPath('SVC-3'), wrapApi: wrap });
    await waitFor(() => expect(handlers).toHaveLength(1));

    unmount();

    expect(close).toHaveBeenCalled();
  });
});
