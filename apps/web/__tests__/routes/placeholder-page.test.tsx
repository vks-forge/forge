/**
 * Pins: a not-yet-built screen shows the shared EmptyState (centred title, one help line with the
 * batch) and keeps a heading for assistive tech and the tab title, naming the project when it
 * sits inside one.
 *
 * Why: the old placeholder was a bare block at the top left that read as an error; every empty
 *   screen now looks the same, and a screen reader must still learn which screen it is on.
 * Depends on: routes/placeholder-page, components/ui/empty-state.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { PlaceholderPage } from '#/routes/placeholder-page.js';

const entry = {
  segment: 'issues',
  label: 'Issues',
  batch: 'B9',
  blurb: 'Every GitHub issue Forge knows about.',
};

describe('PlaceholderPage', () => {
  it('draws the shared EmptyState with the blurb and the batch', () => {
    render(
      <MemoryRouter initialEntries={['/p/alpha/issues']}>
        <Routes>
          <Route
            path="/p/:slug/issues"
            element={<PlaceholderPage entry={entry} inProject />}
          />
        </Routes>
      </MemoryRouter>,
    );

    const status = screen.getByRole('status');

    expect(status).toHaveAttribute('data-variant', 'page');
    expect(
      screen.getByRole('heading', { name: 'Issues is not built yet' }),
    ).toBeInTheDocument();

    expect(status).toHaveTextContent('Every GitHub issue Forge knows about.');
    expect(status).toHaveTextContent('Coming in B9');
    expect(
      screen.getByRole('heading', { level: 1, name: 'alpha: Issues' }),
    ).toBeInTheDocument();

    expect(document.title).toBe('Issues · Forge');
  });
});
