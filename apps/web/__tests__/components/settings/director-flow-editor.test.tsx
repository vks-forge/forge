/**
 * Pins: the flow editor on the Forge Director page: reorder, switch, condition and custom steps
 * save as the exact flow JSON, the locked steps offer no move, switch or remove, and a flow
 * that breaks a locked rule is refused in the page with a reason.
 *
 * Why: a flow saved without its write-plan or approve step, or with a custom step after them,
 *   would plan without the approval floor (d-0146). Every control the editor offers must
 *   either produce a flow the server accepts or say why it is unavailable. Pinned over the
 *   stubbed Forge server, which validates with core's schemas.
 * Depends on: routes/settings/director-page, helpers/render-settings, helpers/choose. jsdom.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose } from '#tests/helpers/choose.js';
import {
  lastCompanyPut as lastPut,
  saveVersion as save,
} from '#tests/helpers/director-page.js';
import { renderSettings } from '#tests/helpers/render-settings.js';

describe('the planning flow', () => {
  const step = (name: string) => screen.getByRole('listitem', { name });

  it('edits the order, a switch and a custom step, then saves the exact flow', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    await screen.findByText('Planning flow');

    await user.click(
      screen.getByRole('button', { name: 'Move Verify against code and memory up' }),
    );

    await user.click(screen.getByRole('switch', { name: 'Run Enhance the decisions' }));
    await user.click(screen.getByRole('button', { name: 'Add custom step' }));
    await user.type(screen.getByLabelText('Step name'), 'Review migrations');
    await user.type(
      screen.getByLabelText('Instructions', { selector: '#new-step-instructions' }),
      'Check names.',
    );

    await user.click(screen.getByRole('button', { name: 'Add step' }));

    const labels = within(screen.getByRole('list', { name: 'Planning flow' }))
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('aria-label'));

    expect(labels).toEqual([
      'Survey the code',
      'Verify against code and memory',
      'Ask what is open',
      'Enhance the decisions',
      'Review migrations',
      'Write the plan',
      'Approve the plan',
    ]);

    expect(step('Enhance the decisions')).toHaveTextContent('switched off');

    await save(user, 'Verify first, review migrations');
    await screen.findByText('Saved as a new version');

    const flow = (lastPut(forge).doc['director'] as { flow: { id: string }[] }).flow;

    expect(flow.map((s) => s.id)).toEqual([
      'survey',
      'verify',
      'grill',
      'enhance',
      'review-migrations',
      'write_plan',
      'approve',
    ]);

    expect(flow[3]).toMatchObject({
      id: 'enhance',
      enabled: false,
      when: { lanes: ['standard', 'full'] },
    });

    expect(flow[4]).toEqual({
      id: 'review-migrations',
      kind: 'custom',
      label: 'Review migrations',
      enabled: true,
      when: 'always',
      instructions: 'Check names.',
      locked: false,
    });
  });

  it('changes a step condition and depth from its details', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    await screen.findByText('Planning flow');

    await user.click(
      screen.getByRole('button', { name: 'Details for Verify against code and memory' }),
    );

    await choose(user, /Runs/, 'By lane');
    await choose(user, 'Lanes', 'Express');
    await user.keyboard('{Escape}');
    await choose(user, 'Depth', 'Deep');
    await save(user, 'Verify deeper for some lanes');

    await screen.findByText('Saved as a new version');

    const flow = (lastPut(forge).doc['director'] as { flow: { id: string }[] }).flow;

    expect(flow.find((s) => s.id === 'verify')).toMatchObject({
      when: { lanes: ['standard', 'full', 'express'] },
      depth: 'deep',
    });
  });

  it('offers no move, switch or remove on the locked steps and explains why', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/director');
    await screen.findByText('Planning flow');

    for (const name of ['Write the plan', 'Approve the plan']) {
      const row = within(step(name));

      expect(
        row.queryByRole('button', { name: new RegExp(`(Move|Remove) ${name}`) }),
      ).toBeNull();

      expect(row.queryByRole('switch')).toBeNull();
      expect(row.getByRole('img', { name: /^Locked:/ })).toBeVisible();
    }

    await user.hover(
      within(step('Approve the plan')).getByRole('img', { name: /^Locked:/ }),
    );

    expect(await screen.findAllByText(/carries the approval rules/)).not.toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Move Survey the code up' }),
    ).toBeDisabled();

    expect(
      screen.getByRole('button', { name: 'Move Enhance the decisions down' }),
    ).toBeDisabled();

    expect(
      screen.getByRole('button', { name: 'Remove Enhance the decisions' }),
    ).toBeEnabled();
  });

  it('removing a step is only a draft: Discard edits brings it back', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/director');
    await screen.findByText('Planning flow');

    await user.click(
      screen.getByRole('button', { name: 'Remove Enhance the decisions' }),
    );

    expect(screen.queryByRole('listitem', { name: 'Enhance the decisions' })).toBeNull();

    await user.click(await screen.findByRole('button', { name: 'Discard edits' }));

    expect(
      await screen.findByRole('listitem', { name: 'Enhance the decisions' }),
    ).toBeVisible();
  });

  it('refuses to add a custom step without a name or instructions, saying which', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/director');
    await screen.findByText('Planning flow');

    await user.click(screen.getByRole('button', { name: 'Add custom step' }));
    await user.click(screen.getByRole('button', { name: 'Add step' }));

    expect(await screen.findByText(/Give the step a name of 1 to 80/)).toBeVisible();
    expect(screen.getByText('Say what the Director should do.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('form', { name: 'Add a custom step' })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Save settings' })).toBeNull();
  });

  it('blocks the save while a custom step has no instructions', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/director');
    await screen.findByText('Planning flow');

    await user.click(screen.getByRole('button', { name: 'Add custom step' }));
    await user.type(screen.getByLabelText('Step name'), 'Extra');
    await user.type(
      screen.getByLabelText('Instructions', { selector: '#new-step-instructions' }),
      'Do it',
    );

    await user.click(screen.getByRole('button', { name: 'Add step' }));
    await user.click(screen.getByRole('button', { name: 'Details for Extra' }));
    await user.clear(
      screen.getByLabelText('Instructions', { selector: '#flow-extra-instructions' }),
    );

    expect(await screen.findByText('A custom step needs instructions.')).toBeVisible();
    expect(
      await screen.findByText(/Fix 1 field marked above before saving/),
    ).toBeVisible();

    expect(screen.getByRole('button', { name: 'Save as version 3' })).toBeDisabled();
  });

  it('leaves no tooltip behind after a move button reorders the row under the pointer', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/director');
    await screen.findByText('Planning flow');
    const down = screen.getByRole('button', { name: 'Move Survey the code down' });
    await user.hover(down);
    await screen.findByRole('tooltip');

    await user.click(down);
    await user.pointer({ target: document.body });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
