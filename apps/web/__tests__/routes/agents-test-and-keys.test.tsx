/**
 * Pins: the Test agent button (cost note first, reply, plain-words failures) and keyboard reach of the
 * roster and its menus.
 *
 * Why: a test that spends money without saying so, a failure shown as a code, or a control only a
 * mouse can reach would each fail the owner at the moment they are checking their work. Each is
 * pinned here over the stubbed Forge server.
 * Depends on: components/agents/*, the stubbed Forge server, renderApp, agent-screens.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { bodiesTo, openEditor, pickMenu } from '#tests/helpers/agent-screens.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { json, refusal } from '#tests/helpers/fetch-stub.js';

const PATH = '/settings/agents';

describe('Test agent', () => {
  it('states the cost first, then shows the reply, model, time and cost', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await openEditor(user, 'Critic');

    expect(
      screen.getByText(
        /one question — "In one line, state your role and the first rule in your instructions\."/,
      ),
    ).toBeVisible();

    expect(
      screen.getByText(
        /Spends one model call on the project’s default harness, with no tools/,
      ),
    ).toBeVisible();

    expect(screen.queryByText(/\$0\.10/)).toBeNull();

    expect(forge.stub.callsTo('POST /agents/test')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Test agent' }));

    expect(
      await screen.findByText(/My first rule is to read every change/),
    ).toBeVisible();

    expect(
      screen.getByText(/model opus · claude-code · 2\.4 s · \$0\.0123/),
    ).toBeVisible();

    expect(bodiesTo(forge, 'POST', '/agents/test')[0]).toMatchObject({
      agent: { name: 'Critic', role: 'reviewer' },
    });
  });

  it('tests what is on screen, saved or not', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await openEditor(user, 'Critic');

    await user.type(screen.getByLabelText('Description'), ' (draft)');
    await user.click(screen.getByRole('button', { name: 'Test agent' }));
    await screen.findByText(/My first rule/);

    expect(
      (bodiesTo(forge, 'POST', '/agents/test')[0] as { agent: { description: string } })
        .agent.description,
    ).toMatch(/\(draft\)$/);
  });

  it.each([
    ['auth', 'The harness is not signed in.', 'Sign in on the harness page'],
    ['quota', 'The harness has no quota left right now.', 'Wait for it to reset'],
    ['stall', 'The harness stopped answering.', 'Test again'],
  ])(
    'a failed probe (%s) reads in plain words with what to try',
    async (family, what, fix) => {
      const user = userEvent.setup();
      renderApp({
        path: PATH,
        routes: {
          'POST /agents/test': json({
            ok: false,
            harness_id: 'claude-code',
            duration_ms: 900,
            error: { family, message: 'raw detail' },
          }),
        },
      });

      await openEditor(user, 'Critic');
      await user.click(screen.getByRole('button', { name: 'Test agent' }));

      const alert = await screen.findByRole('alert', {}, { timeout: 3000 });

      expect(alert).toHaveTextContent(what);
      expect(alert).toHaveTextContent(fix);
    },
  );

  it('a harness that is not ready is explained, with the way to fix it', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PATH,
      routes: {
        'POST /agents/test': refusal(
          409,
          'harness_not_ready',
          'claude-code is paused until 6 pm.',
        ),
      },
    });

    await openEditor(user, 'Critic');
    await user.click(screen.getByRole('button', { name: 'Test agent' }));

    const alert = await screen.findByText('The harness cannot run a test');

    expect(alert.closest('[role="alert"]')).toHaveTextContent(
      'claude-code is paused until 6 pm.',
    );

    expect(screen.getByRole('link', { name: 'Open harness settings' })).toHaveAttribute(
      'href',
      '/settings/harnesses',
    );
  });

  it('cannot run until the form is complete', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await screen.findByRole('list', { name: 'Agent roster' });

    await pickMenu(user, 'New agent', /From scratch/);

    expect(await screen.findByRole('button', { name: 'Test agent' })).toBeDisabled();
    expect(screen.getByText(/Fix the fields above first/)).toBeVisible();
  });
});

describe('keyboard', () => {
  it('reaches New agent, a row’s Edit and its more-actions menu with Tab alone', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await screen.findByRole('list', { name: 'Agent roster' });

    const reach = async (name: string): Promise<void> => {
      for (let i = 0; i < 60; i += 1) {
        await user.tab();
        if (
          document.activeElement?.getAttribute('aria-label') === name ||
          document.activeElement?.textContent === name
        ) {
          return;
        }
      }

      throw new Error(`Tab never reached ${name}`);
    };

    await reach('New agent');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: /From scratch/ })).toBeVisible();
    await user.keyboard('{Escape}');

    await reach('Edit Reviewer');
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('heading', { name: 'Reviewer', level: 2 }),
    ).toBeVisible();
  });

  it('opens a row’s menu from the keyboard and picks an entry with Enter', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await screen.findByRole('list', { name: 'Agent roster' });

    screen.getByRole('button', { name: 'More actions for Critic' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog', { name: 'Duplicate Critic' })).toBeVisible();
  });
});
