/**
 * Pins: the thread follows new lines while the user is at the bottom, stops following the
 * moment they scroll up (showing "Jump to latest" with a count of what they missed), resumes
 * on request, and renders every item kind.
 *
 * Why: a thread that yanks the page while the user reads an old tool call is unusable, and
 *   one that never follows makes them scroll for every line. jsdom has no layout, so scroll
 *   geometry is set by hand.
 * Depends on: components/thread/worker-thread. No network.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkerThread } from '#/components/thread/worker-thread.js';
import type { ThreadItem } from '#/types/thread.types.js';

const ts = '2026-10-16T10:00:00.000Z';
const lines = (n: number): ThreadItem[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: 'message' as const,
    seq: i + 1,
    ts,
    text: `line ${i + 1}`,
  }));

function geometry(el: HTMLElement, h: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    value: h.scrollHeight,
  });

  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    value: h.clientHeight,
  });
}

const view = (items: ThreadItem[]) => (
  <WorkerThread
    items={items}
    connection="live"
    endStatus={null}
    notice={null}
    pending={new Set()}
    onRetry={() => undefined}
  />
);

describe('WorkerThread scrolling', () => {
  it('follows new lines while at the bottom', () => {
    const { rerender } = render(view(lines(3)));
    const log = screen.getByRole('log');
    geometry(log, { scrollHeight: 900, clientHeight: 400 });

    rerender(view(lines(4)));

    expect(log.scrollTop).toBe(900);
    expect(
      screen.queryByRole('button', { name: /Jump to latest/ }),
    ).not.toBeInTheDocument();
  });

  it('stops following when the user scrolls up, counts new lines, and resumes on request', () => {
    const { rerender } = render(view(lines(3)));
    const log = screen.getByRole('log');
    geometry(log, { scrollHeight: 900, clientHeight: 400 });

    log.scrollTop = 100;
    fireEvent.scroll(log);
    const jump = screen.getByRole('button', { name: /Jump to latest/ });
    expect(jump).toBeInTheDocument();

    rerender(view(lines(5)));

    expect(log.scrollTop).toBe(100);
    expect(
      screen.getByRole('button', { name: /Jump to latest.*2 new/ }),
    ).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Jump to latest/ }));
    });

    expect(log.scrollTop).toBe(900);
    expect(
      screen.queryByRole('button', { name: /Jump to latest/ }),
    ).not.toBeInTheDocument();
  });

  it('never moves the scroll when Follow latest is turned off', () => {
    const { rerender } = render(view(lines(3)));
    const log = screen.getByRole('log');
    geometry(log, { scrollHeight: 900, clientHeight: 400 });
    fireEvent.click(screen.getByLabelText('Follow latest'));

    rerender(view(lines(4)));

    expect(log.scrollTop).toBe(0);
  });
});

describe('WorkerThread items', () => {
  it('renders a tool in progress, an ask, a decision and an error', () => {
    const items: ThreadItem[] = [
      {
        kind: 'tool',
        seq: 1,
        ts,
        callId: 'c',
        name: 'Bash',
        input: { command: 'ls' },
        done: false,
      },
      {
        kind: 'ask',
        seq: 2,
        ts,
        interactionId: 'i',
        interactionKind: 'question',
        prompt: 'UTC?',
      },
      { kind: 'decision', seq: 3, ts, tool: 'Bash', decision: 'ask' },
      { kind: 'status', seq: 4, ts, tone: 'danger', label: 'Run failed', detail: 'boom' },
    ];

    render(
      <WorkerThread
        items={items}
        connection="live"
        endStatus={null}
        notice={null}
        pending={new Set(['i'])}
        onRetry={() => undefined}
      />,
    );

    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('Waiting for your answer')).toBeInTheDocument();
    expect(screen.getByText('Asked about')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Run failed');
  });

  it('shows the waiting message before the first event', () => {
    render(view([]));

    expect(screen.getByText(/Waiting for the Worker/)).toBeInTheDocument();
  });
});
