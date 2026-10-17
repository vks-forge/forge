/**
 * Pins: EmptyState says what is missing in one title and one help line, offers its actions,
 * and has a page and a compact size.
 *
 * Why: every screen shows "nothing here"; if the block loses its title, help line or action
 *   on some screen the user is stuck with a blank area, and the compact size is what keeps a
 *   board column or drawer from being swallowed by a page-sized block.
 * Depends on: src/components/ui/empty-state, src/components/status/state-panel. jsdom.
 */

import { render, screen } from '@testing-library/react';
import { SearchX } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { StatePanel } from '#/components/status/state-panel.js';
import { EmptyState } from '#/components/ui/empty-state.js';

describe('EmptyState', () => {
  it('shows the title, the help line and the actions', () => {
    render(
      <EmptyState title="No runs here" icon={SearchX} actions={<button>Start</button>}>
        A run appears when a Worker starts.
      </EmptyState>,
    );

    expect(screen.getByRole('heading', { name: 'No runs here' })).toBeInTheDocument();
    expect(screen.getByText('A run appears when a Worker starts.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('is a polite status with a decorative icon', () => {
    render(<EmptyState title="Nothing" />);

    const status = screen.getByRole('status');

    expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the compact variant with a smaller heading than the page variant', () => {
    const { rerender } = render(<EmptyState title="Empty" variant="compact" />);

    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'compact');
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();

    rerender(<EmptyState title="Empty" />);

    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'page');
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('is what StatePanel renders for its empty kind', () => {
    render(
      <StatePanel kind="empty" title="Nothing matches" actions={<a href="/x">Clear</a>}>
        Try fewer words.
      </StatePanel>,
    );

    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'page');
    expect(screen.getByRole('link', { name: 'Clear' })).toBeInTheDocument();
  });
});
