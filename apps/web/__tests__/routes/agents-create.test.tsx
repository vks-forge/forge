/**
 * Pins: making an agent in Forge settings: from scratch, from a template and from the Director's
 * draft, and what each does and does not save.
 *
 * Why: a template that saves under the wrong origin, a Director draft that is stored before the
 * owner agreed, or a form that shouts about a blank name before anyone typed would each cost the
 * owner trust. The draft's refusals (a broken role bound, a slow Director, no model) must reach the
 * screen in words, and cancelling a draft must keep what was typed. Each is pinned here over the
 * stubbed Forge server.
 * Depends on: components/agents/*, the stubbed Forge server, renderApp, agent-screens.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { bodiesTo, pickMenu, saveAgent } from '#tests/helpers/agent-screens.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { refusal } from '#tests/helpers/fetch-stub.js';

const PATH = '/settings/agents';

async function ready(): Promise<void> {
  await screen.findByRole('heading', { name: 'Agents', level: 1 });
  await screen.findByRole('list', { name: 'Agent roster' });
}

describe('company agents: making one', () => {
  it('from scratch posts the form with origin custom and the version it opened at', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await ready();

    await pickMenu(user, 'New agent', /From scratch/);
    await screen.findByRole('heading', { name: 'New agent', level: 2 });
    expect(screen.getByText('Started from scratch.')).toBeVisible();

    await user.type(screen.getByLabelText('Name'), 'Release notes');
    await user.type(screen.getByLabelText('Description'), 'Drafts release notes.');
    await saveAgent(user, 'Create agent', 'a new agent');

    expect(await screen.findByText('Created as version 3.')).toBeVisible();

    const [sent] = bodiesTo(forge, 'POST', '/settings/agents') as {
      agent: { name: string; role: string; tools: string; write_scope: string[] };
      origin: string;
      expected_version: number;
      reason: string;
    }[];

    expect(sent).toMatchObject({
      origin: 'custom',
      expected_version: 2,
      reason: 'a new agent',
      agent: {
        name: 'Release notes',
        role: 'writer',
        tools: 'lane_default',
        write_scope: ['**'],
      },
    });

    expect(
      screen.getByRole('heading', { name: 'Release notes', level: 2 }),
    ).toBeVisible();
  });

  it('shows the field problems only after a try, in words', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await ready();

    await pickMenu(user, 'New agent', /From scratch/);
    await user.type(await screen.findByLabelText('Description'), 'Does a thing.');
    await user.type(screen.getByLabelText('Reason for this change'), 'blank name');

    expect(screen.queryByText('Give the agent a name.')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Create agent' }));

    expect(await screen.findByText('Give the agent a name.')).toBeVisible();
    expect(
      screen.getByText('One field needs fixing before this can be saved.'),
    ).toBeVisible();

    expect(bodiesTo(forge, 'POST', '/settings/agents')).toHaveLength(0);
  });

  it('from a template prefills the form and posts origin template:<id>', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await ready();

    await pickMenu(user, 'New agent', /From template/);
    const gallery = await screen.findByRole('dialog', { name: 'Start from a template' });
    expect(within(gallery).getAllByRole('heading', { level: 3 })).toHaveLength(6);

    await user.click(
      within(gallery).getByRole('button', { name: /Use template Security reviewer/ }),
    );

    await screen.findByRole('heading', { name: 'Security reviewer', level: 2 });
    expect(screen.getByText('Started from a template.')).toBeVisible();
    expect(screen.getByLabelText('Name')).toHaveValue('Security reviewer');
    expect(forge.stub.callsTo('POST /settings/agents')).toHaveLength(0);

    await saveAgent(user, 'Create agent', 'from the gallery');
    await screen.findByText('Created as version 3.');

    expect(bodiesTo(forge, 'POST', '/settings/agents')[0]).toMatchObject({
      origin: 'template:security-reviewer',
      agent: { name: 'Security reviewer', role: 'reviewer' },
    });
  });

  it('a template gallery that cannot load says so and offers a retry', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PATH,
      routes: { 'GET /agents/templates': refusal(500, 'internal', 'boom') },
    });

    await ready();

    await pickMenu(user, 'New agent', /From template/);

    expect(await screen.findByText('Could not load the templates')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('describing it drafts with the Director, shows its reasoning and saves nothing until Create', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await ready();

    await pickMenu(user, 'New agent', /Describe it to the Director/);
    const dialog = await screen.findByRole('dialog', {
      name: 'Describe it to the Director',
    });

    expect(
      within(dialog).getByRole('button', { name: 'Draft with the Director' }),
    ).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText('What should the agent do?'),
      'Review migrations for data loss.',
    );

    await user.click(
      within(dialog).getByRole('button', { name: 'Draft with the Director' }),
    );

    await screen.findByRole('heading', { name: 'Migration checker', level: 2 });
    expect(bodiesTo(forge, 'POST', '/agents/draft')[0]).toEqual({
      description: 'Review migrations for data loss.',
      scope: 'company',
    });

    expect(
      screen.getByText(
        /Drafted by the Director. Nothing is saved until you press Create agent/,
      ),
    ).toBeVisible();

    expect(screen.getByText(/A reviewer fits/)).toBeVisible();
    expect(screen.getByText('Which migration tool does the project use?')).toBeVisible();
    expect(bodiesTo(forge, 'POST', '/settings/agents')).toHaveLength(0);

    await saveAgent(user, 'Create agent', 'drafted');
    await screen.findByText('Created as version 3.');

    expect(bodiesTo(forge, 'POST', '/settings/agents')[0]).toMatchObject({
      origin: 'director_draft',
      agent: { name: 'Migration checker', role: 'reviewer' },
    });
  });

  it.each([
    [422, 'draft_invalid', 'The Director’s draft broke a rule'],
    [502, 'draft_failed', 'The Director could not write a draft'],
    [503, 'not_available', 'No Director model is connected'],
    [504, 'step_timeout', 'The Director took too long'],
  ])('a %i from the draft route reads as plain words', async (status, code, title) => {
    const user = userEvent.setup();
    renderApp({
      path: PATH,
      routes: {
        'POST /agents/draft': {
          status,
          body: {
            error: {
              code,
              message: 'raw',
              issues: [{ path: ['tools'], message: 'a reviewer cannot use edit' }],
            },
          },
        },
      },
    });

    await ready();
    await pickMenu(user, 'New agent', /Describe it to the Director/);
    await user.type(
      await screen.findByLabelText('What should the agent do?'),
      'Review everything carefully.',
    );

    await user.click(screen.getByRole('button', { name: 'Draft with the Director' }));

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent(title);
    expect(alert).not.toHaveTextContent(code);
    if (status === 422) {
      expect(alert).toHaveTextContent('tools: a reviewer cannot use edit');
    }
  });

  it('cancelling a draft in flight keeps the description and saves nothing', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: PATH,
      routes: {
        'POST /agents/draft': {
          delayMs: 400,
          body: { definition: {}, rationale: '', questions: [] },
        },
      },
    });

    await ready();
    await pickMenu(user, 'New agent', /Describe it to the Director/);
    await user.type(
      await screen.findByLabelText('What should the agent do?'),
      'Review things.',
    );

    await user.click(screen.getByRole('button', { name: 'Draft with the Director' }));

    expect(await screen.findByText(/Director is drafting/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel drafting' }));

    await waitFor(() => expect(screen.queryByText(/Director is drafting/)).toBeNull());
    expect(screen.getByLabelText('What should the agent do?')).toHaveValue(
      'Review things.',
    );

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(
      screen.getByRole('dialog', { name: 'Describe it to the Director' }),
    ).toBeVisible();

    expect(forge.stub.callsTo('POST /settings/agents')).toHaveLength(0);
  });
});
