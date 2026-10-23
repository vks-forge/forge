/**
 * Pins: a project's Director override: each setting is inherited ("Using company default")
 * until switched on, a save writes only the overridden keys, Reset to company drops them all,
 * and a broken flow is refused in the page before the server is asked.
 *
 * Why: one project may need a stricter Director without changing the others. The failures that
 *   hurt are quiet ones: an inherited value frozen into the project as an override, a reset
 *   that leaves keys behind, a flow saved without its locked steps. Each is pinned over the
 *   stubbed Forge server, which merges and validates like the real one.
 * Depends on: routes/project-settings, helpers/render-screens, helpers/choose. jsdom.
 */

import { STEP_NAMES } from '@forge/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose } from '#tests/helpers/choose.js';
import { renderScreens } from '#tests/helpers/render-screens.js';

const PATH = '/p/sample-service/settings/director';

async function ready(): Promise<void> {
  await screen.findByRole('heading', { name: 'Director for this project', level: 2 });
}

const saveWith = async (
  user: ReturnType<typeof userEvent.setup>,
  reason: string,
  label: string,
) => {
  await user.type(screen.getByLabelText('Reason for this change'), reason);
  await user.click(screen.getByRole('button', { name: label }));
};

describe('project Director override', () => {
  it('starts on the company default, with every setting inherited and shown', async () => {
    renderScreens(PATH);
    await ready();

    expect(screen.getByText('Using company default.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reset to company' })).toBeDisabled();

    for (const name of [
      'Override Director house rules',
      'Override Director plan approval',
      'Override Director planning flow',
    ]) {
      expect(screen.getByRole('switch', { name })).not.toBeChecked();
    }

    expect(screen.getByText('No house rules')).toBeVisible();
    expect(screen.getByText('Director approves when the floor passes')).toBeVisible();
    expect(screen.getByText(/Survey the code → Ask what is open/)).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Director page in Forge settings' }),
    ).toHaveAttribute('href', '/settings/director');
  });

  it('saves only the overridden keys and shows the next version', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(PATH);
    await ready();

    await user.click(
      screen.getByRole('switch', { name: 'Override Director plan approval' }),
    );

    expect(screen.getByText('Overriding 1 Director setting.')).toBeVisible();

    await choose(user, 'Plan approval', 'Always ask me');
    await saveWith(user, 'billing needs a human', 'Save as v4');

    expect(await screen.findByText(/Saved as version 4/)).toBeInTheDocument();

    const snapshot = await api.projectSettings.get('sample-service');

    expect(snapshot.override['director']).toEqual({ approval_mode: 'always_ask' });
    expect(snapshot.config.forge.director.approval_mode).toBe('always_ask');
    expect(snapshot.config.forge.director.house_rules).toBe('');
  });

  it('inherits the sign-off ceiling, and overriding it lowers it for this project only', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(PATH);
    await ready();

    expect(screen.getByText('Up to tier B')).toBeVisible();

    await user.click(screen.getByRole('switch', { name: 'Override Director sign-off' }));
    await choose(user, 'Director sign-off', 'Never');
    expect(
      screen.getByText(
        'Protected files (auth, migrations, secrets, billing): the Director signs them off only when every check passed and no secret file is touched; otherwise you do.',
      ),
    ).toBeVisible();

    await saveWith(user, 'every change is mine here', 'Save as v4');
    expect(await screen.findByText(/Saved as version 4/)).toBeInTheDocument();

    const snapshot = await api.projectSettings.get('sample-service');

    expect(snapshot.override['director']).toEqual({ sign_off: { max_tier: 'none' } });
  });

  it('writes the whole timeout group when one timeout is changed', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(PATH);
    await ready();

    await user.click(
      screen.getByRole('switch', { name: 'Override Director step timeouts' }),
    );

    const box = screen.getByLabelText('Verify may run up to');
    await user.clear(box);
    await user.type(box, '90');
    await saveWith(user, 'faster verify', 'Save as v4');
    await screen.findByText(/Saved as version 4/);

    const timeouts = (
      (await api.projectSettings.get('sample-service')).override['director'] as {
        step_timeouts_ms: Record<string, number>;
      }
    ).step_timeouts_ms;

    expect(timeouts['verify']).toBe(90_000);
    expect(Object.keys(timeouts)).toHaveLength(STEP_NAMES.length);
  });

  it('Reset to company drops every override, and saving removes the key', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(PATH);
    await ready();

    await user.click(
      screen.getByRole('switch', { name: 'Override Director house rules' }),
    );

    await user.type(screen.getByLabelText('House rules'), 'No billing edits.');
    await saveWith(user, 'rule', 'Save as v4');
    await screen.findByText(/Saved as version 4/);

    expect(await screen.findByText('Overriding 1 Director setting.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Reset to company' }));

    expect(screen.getByText('Using company default.')).toBeVisible();
    expect(
      screen.getByRole('switch', { name: 'Override Director house rules' }),
    ).not.toBeChecked();

    await saveWith(user, 'back to company', 'Save as v5');
    await screen.findByText(/Saved as version 5/);

    const snapshot = await api.projectSettings.get('sample-service');

    expect(snapshot.override).not.toHaveProperty('director');
    expect(snapshot.override).toHaveProperty('default_harness');
  });

  it('turning one override off puts the company value back and removes only that key', async () => {
    const user = userEvent.setup();
    renderScreens(PATH);
    await ready();

    await user.click(
      screen.getByRole('switch', { name: 'Override Director house rules' }),
    );

    await user.click(
      screen.getByRole('switch', { name: 'Override Director plan approval' }),
    );

    await user.click(
      screen.getByRole('switch', { name: 'Override Director house rules' }),
    );

    expect(screen.getByText('Overriding 1 Director setting.')).toBeVisible();
    expect(
      screen.getByRole('switch', { name: 'Override Director house rules' }),
    ).not.toBeChecked();
  });

  it('refuses a flow that breaks the locked steps before saving, saying why', async () => {
    const user = userEvent.setup();
    renderScreens(PATH);
    await ready();

    await user.click(
      screen.getByRole('switch', { name: 'Override Director planning flow' }),
    );

    await user.click(screen.getByRole('button', { name: 'Add custom step' }));
    await user.type(screen.getByLabelText('Step name'), 'Extra');
    await user.type(
      screen.getByLabelText('Instructions', { selector: '#new-step-instructions' }),
      'Check it',
    );

    await user.click(screen.getByRole('button', { name: 'Add step' }));
    await user.click(screen.getByRole('button', { name: 'Details for Extra' }));
    await user.clear(
      screen.getByLabelText('Instructions', { selector: '#flow-extra-instructions' }),
    );

    expect(
      (await screen.findAllByText('A custom step needs instructions.')).length,
    ).toBeGreaterThan(0);

    await user.type(screen.getByLabelText('Reason for this change'), 'try');

    expect(screen.getByRole('button', { name: 'Save as v4' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move Survey the code up' }),
    ).toBeDisabled();

    expect(
      within(screen.getByRole('listitem', { name: 'Write the plan' })).queryByRole(
        'button',
        {
          name: /Remove/,
        },
      ),
    ).toBeNull();
  });

  it('saves an edited flow as the project override', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(PATH);
    await ready();

    await user.click(
      screen.getByRole('switch', { name: 'Override Director planning flow' }),
    );

    await user.click(screen.getByRole('switch', { name: 'Run Enhance the decisions' }));
    await saveWith(user, 'no enhance here', 'Save as v4');
    await screen.findByText(/Saved as version 4/);

    const flow = (
      (await api.projectSettings.get('sample-service')).override['director'] as {
        flow: { id: string; enabled: boolean }[];
      }
    ).flow;

    await waitFor(() =>
      expect(flow.find((s) => s.id === 'enhance')?.enabled).toBe(false),
    );

    expect(flow.map((s) => s.id).slice(-2)).toEqual(['write_plan', 'approve']);
  });
});
