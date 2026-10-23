/**
 * Pins: Settings, Project, Tool approvals lists every "always" rule the owner granted (in plain
 * words, with the ticket it came from and the date), says so plainly when there are none,
 * revokes only through a saved version with a reason (marked first, undoable, then saved from
 * the shared bar so the history carries who and why), and cannot add or edit a rule.
 *
 * Why: "Always for this project" is a standing permission. If the owner could not see it, take
 *   it back, or leave a reason for taking it back, the permission would outlive their trust in
 *   it. Each of those is pinned over the stubbed Forge server, which saves versions the way the
 *   real one does.
 * Depends on: routes/project-settings, helpers/render-screens. jsdom.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderScreens } from '#tests/helpers/render-screens.js';

const PATH = '/p/sample-service/settings/approvals';
const SLUG = 'sample-service';

const RULES = [
  {
    id: 'ap-1',
    action: 'shell',
    resource: 'make install-deps',
    effect: 'allow',
    created_at: '2026-10-18T09:30:00.000Z',
    source: { ticket_id: 'SVC-4', interaction_id: 'int-p1' },
  },
  {
    id: 'ap-2',
    action: 'edit',
    resource: 'db/migrations/**',
    effect: 'allow',
    created_at: '2026-10-19T10:00:00.000Z',
    source: { ticket_id: 'SVC-7', interaction_id: 'int-p2' },
  },
];

/** Renders the tab after the project saved `rules` as its approved list (none: nothing saved). */
async function open(rules: readonly Record<string, unknown>[] = RULES) {
  const view = renderScreens(PATH);
  const { api } = view;

  if (rules.length > 0) {
    const snapshot = await api.projectSettings.get(SLUG);
    await api.projectSettings.save({
      slug: SLUG,
      doc: { ...snapshot.override, tool_grants: { approved: rules } },
      reason: 'Always allowed from SVC-4',
      expectedVersion: snapshot.version.project,
    });
  }

  // The screen loaded before the save above; leaving and coming back reads the saved version.
  await view.router.navigate('/elsewhere');
  await screen.findByText('elsewhere');
  await view.router.navigate(PATH);
  await screen.findByRole('heading', { name: 'Tool approvals', level: 2 });

  if (rules.length > 0) {
    await screen.findByRole('list', { name: 'Always-allowed steps' });
  }

  return view;
}

describe('Tool approvals tab', () => {
  it('is listed among the project tabs', async () => {
    await open();

    expect(
      within(
        screen.getByRole('navigation', { name: 'Project settings sections' }),
      ).getByRole('link', { name: 'Tool approvals' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('says in plain words when nothing is always allowed', async () => {
    await open([]);

    expect(screen.getByText('Nothing is always allowed')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Revoke/ })).toBeNull();
  });

  it('lists each rule in words with its ticket link and date', async () => {
    await open();

    const list = await screen.findByRole('list', { name: 'Always-allowed steps' });
    const [first, second] = within(list).getAllByRole('listitem');

    expect(first).toHaveTextContent('Always allow the command `make install-deps`');
    expect(within(first!).getByRole('link', { name: 'SVC-4' })).toHaveAttribute(
      'href',
      '/p/sample-service/tickets/SVC-4',
    );

    expect(second).toHaveTextContent('Always allow edits under `db/migrations/`');
    expect(within(second!).getByRole('link', { name: 'SVC-7' })).toBeVisible();
    expect(within(first!).getByText(/2026|Oct/)).toBeVisible();

    // No glob syntax and no raw action ids reach the owner.
    expect(second).not.toHaveTextContent('**');
  });

  it('marks a revoke, lets it be undone, and saves nothing until the bar is used', async () => {
    const user = userEvent.setup();
    const { forge } = await open();

    await user.click(
      await screen.findByRole('button', { name: /^Revoke: .*make install-deps/ }),
    );

    expect(screen.getByText(/Will be revoked when you save/)).toBeVisible();
    expect(screen.getByRole('button', { name: /^Save as v/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /^Keep: .*make install-deps/ }));

    expect(screen.queryByText(/Will be revoked when you save/)).toBeNull();
    expect(forge.stub.callsTo('PUT /settings/projects/:slug').length).toBe(1);
  });

  it('saves a new version without the revoked rule, with the owner reason', async () => {
    const user = userEvent.setup();
    const { api } = await open();

    await user.click(
      await screen.findByRole('button', { name: /^Revoke: .*make install-deps/ }),
    );

    await user.type(screen.getByLabelText('Reason for this change'), 'no longer needed');
    await user.click(screen.getByRole('button', { name: /^Save as v/ }));

    await waitFor(async () => {
      const snapshot = await api.projectSettings.get(SLUG);
      const grants = snapshot.override['tool_grants'] as { approved: { id: string }[] };

      expect(grants.approved.map((rule) => rule.id)).toEqual(['ap-2']);
      expect(snapshot.versions.at(-1)?.reason).toBe('no longer needed');
    });

    const list = await screen.findByRole('list', { name: 'Always-allowed steps' });

    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).not.toHaveTextContent('make install-deps');
  });

  it('keeps the other settings in the saved document', async () => {
    const user = userEvent.setup();
    const { api } = await open();
    const before = await api.projectSettings.get(SLUG);

    await user.click(
      await screen.findByRole('button', { name: /^Revoke: .*db\/migrations/ }),
    );

    await user.type(screen.getByLabelText('Reason for this change'), 'moved to a script');
    await user.click(screen.getByRole('button', { name: /^Save as v/ }));

    await waitFor(async () => {
      const after = await api.projectSettings.get(SLUG);

      expect(after.version.project).toBe(before.version.project + 1);
      expect({ ...after.override, tool_grants: undefined }).toEqual({
        ...before.override,
        tool_grants: undefined,
      });
    });
  });

  it('offers no way to add or edit a rule here', async () => {
    await open();

    await screen.findByRole('list', { name: 'Always-allowed steps' });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^(Add|Edit)/ })).toBeNull();
  });
});
