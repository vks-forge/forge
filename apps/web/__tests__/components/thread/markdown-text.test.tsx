/**
 * Pins: Worker messages render markdown as elements (never HTML), unsafe links stay text,
 * and the thread's grids and rows can shrink below their content.
 *
 * Why: raw asterisks made Worker messages hard to read, and nowrap tool rows inside auto
 *   grid tracks pushed the thread under the Runs column. A script-bearing link or
 *   injected tag must stay inert text.
 * Depends on: components/thread/markdown-text, thread-item-view, worker-thread. No network.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownText } from '#/components/thread/markdown-text.js';
import { ThreadItemView } from '#/components/thread/thread-item-view.js';
import { WorkerThread } from '#/components/thread/worker-thread.js';
import type { ThreadItem } from '#/types/thread.types.js';

const ts = '2026-10-16T10:00:00.000Z';

describe('MarkdownText', () => {
  it('draws bold, code, lists and a safe link', () => {
    const { container } = render(
      <MarkdownText
        text={'**Layout:** see `a.ts`\n\n- one\n- two\n\n[docs](https://example.com)'}
      />,
    );

    expect(container.querySelector('strong')?.textContent).toBe('Layout:');
    expect(container.querySelector('code')?.textContent).toBe('a.ts');
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);

    const link = screen.getByRole('link', { name: 'docs' });

    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('keeps javascript links and tags as text', () => {
    const { container } = render(
      <MarkdownText text={'[x](javascript:alert(1)) <img src=x onerror=alert(1)>'} />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('draws a code block in a scrollable pre', () => {
    const { container } = render(<MarkdownText text={'```\nlong line\n```'} />);

    expect(container.querySelector('pre')).toHaveClass('overflow-auto');
  });
});

describe('thread layout', () => {
  it('renders a message item as markdown', () => {
    const item: ThreadItem = { kind: 'message', seq: 1, ts, text: '**Done** now' };
    const { container } = render(
      <ThreadItemView item={item} expandTools={false} pending={new Set()} />,
    );

    expect(container.querySelector('strong')?.textContent).toBe('Done');
    expect(container.textContent).not.toContain('**');
  });

  it('lets every thread container and bubble shrink so nothing widens the column', () => {
    const items: ThreadItem[] = [{ kind: 'message', seq: 1, ts, text: 'hi' }];
    const { container } = render(
      <WorkerThread
        items={items}
        connection="live"
        endStatus={null}
        notice={null}
        pending={new Set()}
        onRetry={() => undefined}
      />,
    );

    const boxes = container.querySelectorAll('section, li, [role="log"] > div');

    expect(boxes.length).toBeGreaterThan(1);

    for (const box of boxes) {
      expect(box.className).toContain('min-w-0');
    }

    const bubble = screen.getByText('hi').closest('div[class*="max-w-"]');

    expect(bubble?.className).toContain('min-w-0');
    expect(bubble?.className).toContain('max-w-[min(70%,36rem)]');
  });

  it('lets a tool row shrink so its hint truncates instead of widening', () => {
    const item: ThreadItem = {
      kind: 'tool',
      seq: 2,
      ts,
      callId: 'c1',
      name: 'Read',
      input: { path: '/a/very/long/path'.repeat(20) },
      done: true,
    };

    render(<ThreadItemView item={item} expandTools={false} pending={new Set()} />);

    const button = screen.getByRole('button', { expanded: false });

    expect(button).toHaveClass('min-w-0');
    expect(button.parentElement).toHaveClass('min-w-0');
  });
});
