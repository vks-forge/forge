/**
 * Pins: the sticky section tabs scroll to their section, write it into the URL hash, move
 * focus to the section heading, and mark the section the reader is in as current.
 *
 * Why: the harness page is five sections long. If a tab did not scroll, did not tell a
 *   keyboard user where they landed, or kept highlighting the wrong section, the bar would
 *   be decoration instead of navigation.
 * Depends on: src/components/settings/section-nav. jsdom with IntersectionObserver and
 *   scrollIntoView stubbed.
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionNav } from '#/components/settings/section-nav.js';

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

const observers: { callback: Callback; targets: Element[] }[] = [];
const scrollIntoView = vi.fn();

class FakeObserver {
  private readonly record: { callback: Callback; targets: Element[] };

  constructor(callback: Callback) {
    this.record = { callback, targets: [] };
    observers.push(this.record);
  }

  observe(target: Element): void {
    this.record.targets.push(target);
  }

  disconnect(): void {
    this.record.targets.length = 0;
  }
}

const TABS = [
  { id: 'signin', label: 'Sign-in' },
  { id: 'test', label: 'Test' },
];

function renderNav() {
  return render(
    <>
      <SectionNav tabs={TABS} />
      <section id="signin">
        <h2>Sign-in</h2>
      </section>
      <section id="test">
        <h2>Test</h2>
      </section>
    </>,
  );
}

describe('SectionNav', () => {
  beforeEach(() => {
    observers.length = 0;
    scrollIntoView.mockClear();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    Element.prototype.scrollIntoView = scrollIntoView;
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scrolls smoothly, sets the hash and focuses the heading when a tab is clicked', async () => {
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByRole('link', { name: 'Test' }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(window.location.hash).toBe('#test');
    expect(screen.getByRole('heading', { name: 'Test' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Test' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('marks the section that scrolls into view as current', () => {
    renderNav();
    const spy = observers.find((o) => o.targets.some((t) => t.id === 'test'));
    const target = spy?.targets.find((t) => t.id === 'test');

    act(() => {
      spy?.callback([{ target: target as Element, isIntersecting: true }]);
    });

    expect(screen.getByRole('link', { name: 'Test' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    expect(screen.getByRole('link', { name: 'Sign-in' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
