/**
 * Pins: a ticket whose current run is live offers "Message the Worker" under the thread; sending
 * posts `{message, author}` to the run's steer endpoint, shows delivery, and the user's line
 * appears in the thread when the run streams it; each refusal (run ended, harness cannot steer,
 * Forge shutting down) is explained in plain words with the draft kept; a finished run offers
 * no box; a ticket links back to its parent card.
 *
 * Why: steering is how the owner redirects a Worker that is going the wrong way. A box on a
 *   dead run, a refusal that reads "409", or a lost message would each make the owner doubt
 *   whether the Worker heard them.
 * Depends on: the stubbed Forge server and scripted run streams via helpers/render-app,
 *   routes/ticket/*, components/thread/*.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import { renderApp } from '#tests/helpers/render-app.js';

const ticketPath = (id: string) => `/p/sample-service/tickets/${id}`;
const DELIVERED = json({
  run_id: 'run-svc-3',
  inbox_seq: 1,
  mode: 'steer',
  status: 'delivered',
});

describe('Message the Worker', () => {
  it('posts the message to the live run and says it was delivered', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: ticketPath('SVC-3'),
      routes: { 'POST /runs/:id/steer': DELIVERED },
    });

    await user.type(
      await screen.findByLabelText('Message the Worker'),
      'Stream in 64 KB chunks',
    );

    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(await screen.findByText(/^Delivered\./)).toBeInTheDocument();
    expect(forge.stub.callsTo('POST /runs/:id/steer')).toMatchObject([
      {
        path: '/runs/run-svc-3/steer',
        body: { message: 'Stream in 64 KB chunks', author: 'owner' },
      },
    ]);

    expect(screen.getByLabelText('Message the Worker')).toHaveValue('');
  });

  it('shows the message in the thread as the user’s line when the run streams it', async () => {
    const { forge } = renderApp({ path: ticketPath('SVC-3') });
    expect(await screen.findByText('Live')).toBeInTheDocument();

    // The stream replays the run's history on a timer after it opens, and the thread drops any
    // event older than the newest it has seen. Wait for the replay to land, so the pushed
    // frame is never raced by (and never drops) the scripted ones on a slow machine.
    await screen.findByText(/Editing the exporter now/);

    await waitFor(() => expect(forge.streams.sources.length).toBeGreaterThan(0));
    forge.streams.sources[0]!.emit('user_message', {
      type: 'user_message',
      seq: 900,
      ts: '2026-10-16T12:00:00.000Z',
      inbox_seq: 1,
      mode: 'steer',
      author: 'owner',
      text: 'Stream in 64 KB chunks',
    });

    const log = await screen.findByRole('log', { name: 'Worker messages' });

    expect(await within(log).findByText('Stream in 64 KB chunks')).toBeInTheDocument();
    expect(within(log).getByText('You → Worker')).toBeInTheDocument();
  });

  it.each([
    ['run_not_live', 409, /This run has ended/],
    ['steer_unsupported', 409, /cannot take messages while it runs/],
    ['server_draining', 503, /Forge is shutting down/],
  ])(
    'explains a %s refusal in plain words and keeps the draft',
    async (code, status, text) => {
      const user = userEvent.setup();
      renderApp({
        path: ticketPath('SVC-3'),
        routes: { 'POST /runs/:id/steer': refusal(status, code, code) },
      });

      await user.type(await screen.findByLabelText('Message the Worker'), 'Try this');
      await user.click(screen.getByRole('button', { name: 'Send to Worker' }));

      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(screen.getByLabelText('Message the Worker')).toHaveValue('Try this');
    },
  );

  it('offers no box on a finished run', async () => {
    renderApp({ path: ticketPath('SVC-1') });
    await screen.findByText(/Run ended/);

    expect(screen.queryByLabelText('Message the Worker')).not.toBeInTheDocument();
  });

  it('links a ticket back to its parent card', async () => {
    renderApp({ path: ticketPath('SVC-3') });

    expect(await screen.findByRole('link', { name: 'FG-C4' })).toHaveAttribute(
      'href',
      '/p/sample-service/cards/FG-C4',
    );
  });
});
