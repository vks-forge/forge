/**
 * Pins: where an agent runs (a harness that cannot run, harness default, a custom model id, the
 * Forge default for the implementer only, fallbacks in order) and tools by role.
 *
 * Why: this is the choice with money and uptime attached. A harness that is down chosen without a
 * word, a model the harness does not offer, a fallback list that cannot be ordered, or a reviewer
 * left holding an edit tool would each cost the owner a run. Each is pinned here over the stubbed
 * Forge server.
 * Depends on: components/agents/*, the stubbed Forge server, renderApp, agent-screens.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  bodiesTo,
  openEditor,
  pickMenu,
  saveAgent,
} from '#tests/helpers/agent-screens.js';
import { choose, chosen } from '#tests/helpers/choose.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import { SAMPLE_HARNESS } from '#tests/helpers/forge-data/agent-data.js';

const PATH = '/settings/agents';

type Put = {
  agent: {
    instructions: string;
    description: string;
    runs_on: { harness: string; model: unknown; fallbacks: { model: { id: string } }[] };
  };
  expected_version: number;
  reason: string;
};

describe('where an agent runs', () => {
  const codex = {
    ...SAMPLE_HARNESS,
    id: 'codex',
    ready: false,
    signed_in: false,
    reasons: ['Paused until 6 pm because it ran out of quota.'],
    fix_href: '/settings/harnesses/codex',
  };

  it('keeps a harness that cannot run in the list, disabled, with why and a way to fix it', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PATH,
      routes: { 'GET /agents/runs-on': json({ harnesses: [SAMPLE_HARNESS, codex] }) },
    });

    await openEditor(user, 'Implementer');
    await user.click(await screen.findByRole('combobox', { name: 'Harness' }));

    const option = await screen.findByRole('option', { name: /codex/ });

    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveTextContent('Paused until 6 pm because it ran out of quota.');

    await user.keyboard('{Escape}');

    const link = screen.getByRole('link', { name: 'Fix in settings: codex' });

    expect(link).toHaveAttribute('href', '/settings/harnesses/codex');
    expect(link.closest('li')).toHaveTextContent('codex cannot run work right now.');
  });

  it('says so when the harness list cannot be read, with a retry, and still saves the rest', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PATH,
      routes: { 'GET /agents/runs-on': refusal(500, 'internal', 'down') },
    });

    await openEditor(user, 'Critic');

    expect(await screen.findByText(/Could not read the harnesses/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    await user.type(screen.getByLabelText('Description'), ' still editable');
    expect(screen.getByRole('button', { name: 'Save agent' })).toBeDisabled();
  });

  it('sends no model for Harness default, then any typed id for a custom model', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await openEditor(user, 'Critic');

    expect(chosen('Model')).toBe('Opus');
    await choose(user, 'Model', 'Harness default');
    await saveAgent(user, 'Save agent', 'follow the harness');
    await screen.findByText('Saved as version 3.');

    await choose(user, 'Model', 'Custom model id…');
    await user.type(screen.getByLabelText('Custom model id'), 'my-model-9');
    await user.type(screen.getByLabelText('Reason for this change'), 'custom');
    await user.click(screen.getByRole('button', { name: 'Save agent' }));
    await screen.findByText('Saved as version 4.');

    const puts = bodiesTo(forge, 'PUT', '/settings/agents/critic') as Put[];

    expect(puts.map((p) => p.agent.runs_on.model)).toEqual([
      { kind: 'harness_default' },
      { kind: 'model', id: 'my-model-9' },
    ]);
  });

  it('offers the Forge default (lane model) only to the implementer', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });

    await openEditor(user, 'Implementer');
    await user.click(await screen.findByRole('combobox', { name: 'Model' }));
    expect(await screen.findByRole('option', { name: /Forge default/ })).toBeVisible();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: /All agents/ }));
    await openEditor(user, 'Critic');
    await user.click(await screen.findByRole('combobox', { name: 'Model' }));
    await screen.findByRole('option', { name: /Harness default/ });

    expect(screen.queryByRole('option', { name: /Forge default/ })).toBeNull();
  });

  it('orders fallbacks with move buttons, saves them in that order and stops at five', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await openEditor(user, 'Reviewer');

    await user.click(screen.getByRole('button', { name: 'Add fallback' }));
    await choose(user, 'Fallback 1 Model', 'Haiku');
    await user.click(screen.getByRole('button', { name: 'Add fallback' }));
    await choose(user, 'Fallback 2 Model', 'Sonnet');
    await user.click(screen.getByRole('button', { name: 'Move fallback 2 up' }));

    expect(chosen('Fallback 1 Model')).toBe('Sonnet');
    expect(screen.getByRole('button', { name: 'Move fallback 1 up' })).toBeDisabled();

    await saveAgent(user, 'Save agent', 'order');
    await screen.findByText('Saved as version 3.');

    const [sent] = bodiesTo(forge, 'PUT', '/settings/agents/reviewer') as Put[];

    expect(sent?.agent.runs_on.fallbacks.map((f) => f.model.id)).toEqual([
      'sonnet',
      'haiku',
    ]);

    for (const model of ['Opus', 'Harness default', 'Custom model id…']) {
      await user.click(screen.getByRole('button', { name: 'Add fallback' }));
      const n = screen.getAllByRole('listitem', { name: /^Fallback/ }).length;
      await choose(user, `Fallback ${n} Model`, model);
      if (model === 'Custom model id…') {
        await user.type(screen.getByLabelText(`Fallback ${n} Custom model id`), 'x1');
      }
    }

    expect(screen.getByRole('button', { name: 'Add fallback' })).toBeDisabled();
    expect(screen.getByText('That is the limit of 5.')).toBeVisible();
  });
});

describe('tools by role', () => {
  it('switching to a reviewer unticks and greys every write tool, with the reason', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await screen.findByRole('list', { name: 'Agent roster' });

    await pickMenu(user, 'New agent', /From scratch/);
    await user.click(
      await screen.findByRole('switch', { name: 'Follow the lane’s default tools' }),
    );

    await user.click(await screen.findByRole('checkbox', { name: /Edit files/ }));
    await user.click(screen.getByRole('checkbox', { name: /Read files/ }));

    expect(screen.getByRole('checkbox', { name: /Edit files/ })).toBeChecked();

    await choose(user, 'Role', /Reviewer/);

    const edit = screen.getByRole('checkbox', { name: /Edit files/ });

    expect(edit).not.toBeChecked();
    expect(edit).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Read files/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Run commands/ })).toBeDisabled();
    expect(
      screen.getAllByText(/Reviewers and researchers cannot use it/).length,
    ).toBeGreaterThan(0);

    expect(screen.getByText(/A reviewer cannot change files/)).toBeVisible();
    expect(
      screen.queryByRole('switch', { name: 'Follow the lane’s default tools' }),
    ).toBeNull();
  });
});
