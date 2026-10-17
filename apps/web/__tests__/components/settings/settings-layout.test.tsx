/**
 * Pins: a settings tab flagged `dirty` shows a dot and carries the description "Unsaved
 * changes" (its name stays the section's); a clean tab shows none.
 *
 * Why: the draft lives above the tabs, so an owner who edits Workers and wanders to Checks would
 *   otherwise have no sign that Workers still holds edits; the dot says which section to return
 *   to before saving or leaving.
 * Depends on: components/settings/settings-layout.
 */

import { render, screen, within } from '@testing-library/react';
import { Users, ListChecks } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SettingsLayout } from '#/components/settings/settings-layout.js';

describe('SettingsLayout unsaved dot', () => {
  it('marks only the tab that holds edits', () => {
    render(
      <MemoryRouter initialEntries={['/s/workers']}>
        <SettingsLayout
          label="Sections"
          tabs={[
            { to: '/s/workers', label: 'Workers', icon: Users, dirty: true },
            { to: '/s/checks', label: 'Checks', icon: ListChecks, dirty: false },
          ]}
        >
          <p>body</p>
        </SettingsLayout>
      </MemoryRouter>,
    );

    const nav = screen.getByRole('navigation', { name: 'Sections' });

    expect(
      within(nav).getByRole('link', { name: 'Workers' }),
    ).toHaveAccessibleDescription('Unsaved changes');

    expect(
      within(nav).getByRole('link', { name: 'Checks' }),
    ).not.toHaveAccessibleDescription();
  });
});
