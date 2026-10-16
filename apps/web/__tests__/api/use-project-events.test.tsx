/**
 * Pins: opening a project mounts one change stream for it; a frame naming `["cards", slug]`
 * makes the Board refetch and show the new card without a reload; polling slows to 30 s while
 * the stream is open and returns to the screen's own pace the moment it is lost; after a drop
 * everything is refetched; leaving the project closes the stream.
 *
 * Why: the user watches the Director plan and Workers build. A Board that ignores the stream
 *   stays stale, a page that keeps polling at 5 s beside an open stream wastes the server, and
 *   one that stays slow after the stream died would go quietly out of date.
 * Depends on: the stubbed Forge server and EventSource via helpers/render-app, api/use-project-events,
 *   api/poll-interval, routes/project-scope.
 */

import { renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LIVE_POLL_MS, useRefetchMs } from '#/api/poll-interval.js';
import { setLiveConnected } from '#/state/live-connection.js';
import type { StubSource } from '#tests/helpers/event-source-stub.js';
import { json } from '#tests/helpers/fetch-stub.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { SAMPLE_CARDS } from '#tests/helpers/forge-data/card-data.js';

const BOARD = '/p/sample-service/board';
const CARDS = 'GET /projects/sample-service/cards';

async function projectStream(
  sources: readonly StubSource[],
  nth = 0,
): Promise<StubSource> {
  await waitFor(() => expect(sources[nth]).toBeDefined());

  return sources[nth]!;
}

const newCard = {
  ...SAMPLE_CARDS[1]!.summary,
  id: 'FG-C9',
  title: 'Added while you were looking',
};

describe('project change stream', () => {
  it('asks for a ticket bound to the project and connects to its stream', async () => {
    const { forge } = renderApp({ path: BOARD });
    const stream = await projectStream(forge.streams.projectSources);

    expect(stream.url).toMatch(
      /^\/api\/projects\/sample-service\/events\?ticket=ticket-\d+$/,
    );

    expect(forge.stub.callsTo('POST /auth/sse-ticket')[0]?.body).toEqual({
      project: 'sample-service',
    });
  });

  it('refetches the Board when the server names its cards key', async () => {
    const { forge } = renderApp({ path: BOARD });
    await screen.findByText('Stream large CSV exports');
    const stream = await projectStream(forge.streams.projectSources);
    stream.open();

    forge.stub.use({
      [CARDS]: json({
        items: [...SAMPLE_CARDS.map((card) => card.summary), newCard],
        nextCursor: null,
      }),
    });

    const before = forge.stub.callsTo(CARDS).length;
    stream.emit('invalidate', { keys: [['cards', 'sample-service']] });

    expect(await screen.findByText('Added while you were looking')).toBeInTheDocument();
    expect(forge.stub.callsTo(CARDS).length).toBe(before + 1);
  });

  it('leaves queries the server did not name alone', async () => {
    const { forge } = renderApp({ path: BOARD });
    await screen.findByText('Stream large CSV exports');
    const stream = await projectStream(forge.streams.projectSources);
    stream.open();

    const before = forge.stub.callsTo(CARDS).length;
    stream.emit('invalidate', { keys: [['tickets', 'sample-service']] });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(forge.stub.callsTo(CARDS).length).toBe(before);
  });

  it('polls slowly while the stream is open and at its own pace when it is lost', async () => {
    const { forge } = renderApp({ path: BOARD });
    const stream = await projectStream(forge.streams.projectSources);
    const pace = renderHook(() => useRefetchMs(5000));

    expect(pace.result.current).toBe(5000);

    stream.open();
    await waitFor(() => expect(pace.result.current).toBe(LIVE_POLL_MS));

    stream.drop();
    await waitFor(() => expect(pace.result.current).toBe(5000));
  });

  it('refetches everything of the project after the stream comes back', async () => {
    const { forge } = renderApp({ path: BOARD });
    await screen.findByText('Stream large CSV exports');
    const first = await projectStream(forge.streams.projectSources);
    first.open();

    const before = forge.stub.callsTo(CARDS).length;
    first.drop();
    const second = await projectStream(forge.streams.projectSources, 1);
    second.open();

    await waitFor(() => expect(forge.stub.callsTo(CARDS).length).toBeGreaterThan(before));
  });

  it('closes the stream and returns to normal polling when the app unmounts', async () => {
    const { forge, unmount } = renderApp({ path: BOARD });
    const stream = await projectStream(forge.streams.projectSources);
    stream.open();

    unmount();

    expect(stream.closed).toBe(true);
    const pace = renderHook(() => useRefetchMs(5000));
    expect(pace.result.current).toBe(5000);
  });

  it('does not open a stream for a project that does not exist', async () => {
    const { forge } = renderApp({ path: '/p/no-such-project/board' });

    expect(await screen.findByText(/There is no project named/)).toBeInTheDocument();
    expect(forge.streams.projectSources).toHaveLength(0);
  });
});

describe('useRefetchMs', () => {
  it('never polls faster than the screen asked for', () => {
    setLiveConnected(true);
    const slow = renderHook(() => useRefetchMs(60_000));

    expect(slow.result.current).toBe(60_000);
  });
});
