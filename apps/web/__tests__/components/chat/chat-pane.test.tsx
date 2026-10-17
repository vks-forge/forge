/**
 * Pins: the composer is docked beside the scrolling list, never inside it, however long the
 * list is (including a windowed Worker thread of 300 lines); the list follows new lines while at
 * the bottom; scrolled up it offers a quiet "Jump to latest"; and a pane remembers the offset it
 * was left at.
 *
 * Why: a chat whose input scrolls away with the history is unusable, and one that yanks the
 *   reader to the bottom while they read old messages is hostile. jsdom has no layout, so scroll
 *   geometry is set by hand.
 * Depends on: components/chat/chat-pane, components/thread/worker-thread.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatPane } from '#/components/chat/chat-pane.js';
import { WorkerThread } from '#/components/thread/worker-thread.js';
import type { ThreadItem } from '#/types/thread.types.js';

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

const Pane = (props: { count: number; memory?: Map<string, number> }) => (
  <ChatPane
    label="Messages"
    count={props.count}
    follow
    {...(props.memory ? { memory: props.memory, memoryKey: 'k' } : {})}
    composer={<textarea aria-label="Say something" />}
  >
    {Array.from({ length: props.count }, (_, i) => (
      <p key={i}>message {i}</p>
    ))}
  </ChatPane>
);

describe('ChatPane', () => {
  it('keeps the composer outside the scrolling list', () => {
    render(<Pane count={200} />);

    const log = screen.getByRole('log', { name: 'Messages' });

    expect(log).not.toContainElement(screen.getByLabelText('Say something'));
    expect(screen.getByLabelText('Say something')).toBeInTheDocument();
  });

  it('offers a quiet Jump to latest once scrolled up, with a count of new lines', () => {
    const { rerender } = render(<Pane count={3} />);
    const log = screen.getByRole('log');
    geometry(log, { scrollHeight: 900, clientHeight: 400 });

    log.scrollTop = 100;
    fireEvent.scroll(log);
    rerender(<Pane count={5} />);

    const jump = screen.getByRole('button', { name: /Jump to latest.*2 new/ });

    expect(jump.className).not.toContain('bg-signal');

    act(() => {
      fireEvent.click(jump);
    });

    expect(log.scrollTop).toBe(900);
  });

  it('parks the offset it was left at and reopens there instead of at the newest line', () => {
    const memory = new Map<string, number>();
    const first = render(<Pane count={50} memory={memory} />);
    const log = screen.getByRole('log');
    geometry(log, { scrollHeight: 2000, clientHeight: 400 });

    log.scrollTop = 300;
    fireEvent.scroll(log);
    first.unmount();

    expect(memory.get('k')).toBe(300);

    render(<Pane count={50} memory={memory} />);

    expect(screen.getByRole('log').scrollTop).toBe(300);
  });
});

describe('WorkerThread with a long run', () => {
  it('keeps the steer box rendered next to a windowed thread of 300 lines', () => {
    const ts = '2026-10-16T10:00:00.000Z';
    const items: ThreadItem[] = Array.from({ length: 300 }, (_, i) => ({
      kind: 'message' as const,
      seq: i + 1,
      ts,
      text: `line ${i + 1}`,
    }));

    render(
      <WorkerThread
        items={items}
        connection="live"
        endStatus={null}
        notice={null}
        pending={new Set()}
        onRetry={() => undefined}
        composer={<textarea aria-label="Message the Worker" />}
      />,
    );

    const log = screen.getByRole('log', { name: 'Worker messages' });
    const box = screen.getByLabelText('Message the Worker');

    expect(box).toBeInTheDocument();
    expect(log).not.toContainElement(box);
  });

  it('groups consecutive Worker messages under one header', () => {
    const base = Date.parse('2026-10-16T10:00:00.000Z');
    const items: ThreadItem[] = [0, 1, 2].map((i) => ({
      kind: 'message' as const,
      seq: i + 1,
      ts: new Date(base + i * 20_000).toISOString(),
      text: `step ${i + 1}`,
    }));

    render(
      <WorkerThread
        items={items}
        connection="live"
        endStatus={null}
        notice={null}
        pending={new Set()}
        onRetry={() => undefined}
      />,
    );

    expect(screen.getAllByText('Worker')).toHaveLength(1);
    expect(screen.getByText('step 3')).toBeInTheDocument();
  });
});
