/**
 * Pins: the ticket's pipeline strip stays live: the server names `["ticket-pipeline", id]` on the
 * project stream when a stage is written and the strip refetches at once without waiting for the
 * poll; another ticket's key leaves it alone; and after the stream dropped and came back the strip
 * is refetched, since nothing is replayed.
 *
 * Why: the owner watches a ticket move through its stages. A strip that waited for a poll would show
 * "Running" long after a stage passed, and one that refetched for every ticket's change would hammer
 * the server. The stream's key is the contract between the two.
 * Depends on: routes/ticket/pipeline-strip, api/use-project-events, the stubbed Forge server and
 * project stream.
 */

import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, sequence } from '#tests/helpers/fetch-stub.js';
import {
  STANDARD_STAGES,
  stageView,
  ticketPipeline,
} from '#tests/helpers/forge-data/pipeline-data.js';
import { renderApp } from '#tests/helpers/render-app.js';

const TICKET = '/p/sample-service/tickets/SVC-1';
const PIPELINE = 'GET /tickets/SVC-1/pipeline';

const stages = (over: Record<string, Parameters<typeof stageView>[1]>) =>
  STANDARD_STAGES.map((s) => (over[s.id] ? { ...s, ...over[s.id] } : s));

const chip = (label: string, status: RegExp | string): HTMLElement =>
  screen.getByRole('button', {
    name: new RegExp(
      `^${label}\\s*${typeof status === 'string' ? status : status.source}`,
    ),
  });

async function strip(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: 'Pipeline stages' });
}

describe('pipeline strip: follows the ticket', () => {
  const second = ticketPipeline(
    stages({ 'test-writer': { status: 'passed' }, implementer: { status: 'running' } }),
  );

  async function streamOf(forge: ReturnType<typeof renderApp>['forge']) {
    await waitFor(() => expect(forge.streams.projectSources[0]).toBeDefined());
    const stream = forge.streams.projectSources[0]!;

    stream.open();

    return stream;
  }

  it('refetches at once when the server names the ticket-pipeline key, without waiting for the poll', async () => {
    const { forge } = renderApp({
      path: TICKET,
      routes: {
        [PIPELINE]: sequence(
          json({ pipeline: ticketPipeline(STANDARD_STAGES) }),
          json({ pipeline: second }),
        ),
      },
    });

    await strip();
    expect(chip('Implement', 'Not yet')).toBeVisible();

    const stream = await streamOf(forge);

    stream.emit('invalidate', { keys: [['ticket-pipeline', 'SVC-1']] });

    expect(
      await screen.findByRole('button', { name: /^Implement\s*Running/ }),
    ).toBeVisible();

    expect(forge.stub.callsTo(PIPELINE)).toHaveLength(2);
  });

  it('leaves the strip alone when the key named belongs to another ticket', async () => {
    const { forge } = renderApp({
      path: TICKET,
      routes: { [PIPELINE]: json({ pipeline: ticketPipeline(STANDARD_STAGES) }) },
    });

    await strip();

    const stream = await streamOf(forge);
    const before = forge.stub.callsTo(PIPELINE).length;

    stream.emit('invalidate', { keys: [['ticket-pipeline', 'SVC-9']] });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(forge.stub.callsTo(PIPELINE)).toHaveLength(before);
  });

  it('refetches the strip after the stream dropped and came back, since nothing is replayed', async () => {
    const { forge } = renderApp({
      path: TICKET,
      routes: {
        [PIPELINE]: sequence(
          json({ pipeline: ticketPipeline(STANDARD_STAGES) }),
          json({ pipeline: second }),
        ),
      },
    });

    await strip();

    const first = await streamOf(forge);

    first.drop();
    await waitFor(() => expect(forge.streams.projectSources[1]).toBeDefined());
    forge.streams.projectSources[1]!.open();

    expect(
      await screen.findByRole('button', { name: /^Implement\s*Running/ }),
    ).toBeVisible();
  });
});
