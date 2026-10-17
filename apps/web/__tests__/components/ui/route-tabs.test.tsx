/**
 * Pins: RouteTabs draws each tab as a link with the ARIA tab roles, marks the active one, shows
 * an amber count only when told something waits on the owner, and the saved scroll position of a
 * panel comes back when it mounts again.
 *
 * Why: the Card and Ticket pages rely on these two small pieces for every view they have; if a
 *   tab were not a link, a deep link, a new-tab click and Back would each break, and a lost
 *   scroll position throws the reader out of a long plan.
 * Depends on: components/ui/route-tabs, components/ui/tab-panel, state/use-scroll-memory.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RouteTabs } from '#/components/ui/route-tabs.js';
import { TabPanel } from '#/components/ui/tab-panel.js';
import type { RouteTab } from '#/types/route-tabs.types.js';

const tabs: RouteTab[] = [
  { id: 'a', label: 'Alpha', to: '/x/a' },
  { id: 'b', label: 'Beta', to: '/x/b', count: 2, attention: true },
];

describe('RouteTabs', () => {
  it('draws links with tab roles and marks the active tab', () => {
    render(
      <MemoryRouter>
        <RouteTabs label="Things" idPrefix="t" tabs={tabs} active="b" />
      </MemoryRouter>,
    );

    const beta = screen.getByRole('tab', { name: /Beta/ });

    expect(screen.getByRole('tablist', { name: 'Things' })).toBeInTheDocument();
    expect(beta).toHaveAttribute('aria-selected', 'true');
    expect(beta).toHaveAttribute('href', '/x/b');
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('2').className).toContain('bg-attn-soft');
  });
});

describe('TabPanel', () => {
  it('puts the saved scroll position back when it mounts again', () => {
    const memory = new Map<string, number>();
    const first = render(
      <TabPanel idPrefix="t" tab="a" memory={memory}>
        <p>long</p>
      </TabPanel>,
    );

    const panel = screen.getByRole('tabpanel');
    panel.scrollTop = 240;
    fireEvent.scroll(panel);
    first.unmount();

    expect(memory.get('a')).toBe(240);

    render(
      <TabPanel idPrefix="t" tab="a" memory={memory}>
        <p>long</p>
      </TabPanel>,
    );

    expect(screen.getByRole('tabpanel').scrollTop).toBe(240);
  });

  it('does not wrap a self-scrolling panel in a scroll box', () => {
    render(
      <TabPanel idPrefix="t" tab="a" memory={new Map()} scroll={false}>
        <p>chat</p>
      </TabPanel>,
    );

    expect(screen.getByRole('tabpanel').className).not.toContain('overflow');
  });
});
