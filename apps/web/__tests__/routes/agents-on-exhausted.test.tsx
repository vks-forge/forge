/**
 * Pins: under an agent's fallback list the owner chooses what happens when every fallback fails:
 * let the Director pick a substitute (the default, so an agent that never chose stores nothing) or
 * pause and tell them; choosing Pause is saved as `on_exhausted: 'pause'`, and choosing the default
 * again removes the key so the stored agent (and its hash) is as it was.
 *
 * Why: this is the last-resort policy of a ticket that cannot run. A choice that is invisible, one
 * that writes a default into every agent (changing its hash for nothing), or one that cannot be undone
 * would leave the owner either surprised by a substitute or stuck with a ticket that waits.
 * Depends on: components/agents/{runs-on-section,fallback-list}, the stubbed Forge server, agent-screens.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { bodiesTo, openEditor, saveAgent } from '#tests/helpers/agent-screens.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PATH = '/settings/agents';

type Put = { agent: { runs_on: Record<string, unknown> } };

describe('when every fallback fails', () => {
  it('offers both choices, with the Director substitute selected for an agent that never chose', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await openEditor(user, 'Reviewer');

    const group = await screen.findByRole('group', { name: 'When every fallback fails' });

    expect(
      within(group).getByRole('radio', { name: /Let the Director pick a substitute/ }),
    ).toBeChecked();

    expect(
      within(group).getByRole('radio', { name: /Pause and tell me/ }),
    ).not.toBeChecked();
  });

  it('saves Pause as on_exhausted: pause', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await openEditor(user, 'Reviewer');

    await user.click(await screen.findByRole('radio', { name: /Pause and tell me/ }));
    await saveAgent(user, 'Save agent', 'pause when stuck');
    await screen.findByText(/Saved as version/);

    const [sent] = bodiesTo(forge, 'PUT', '/settings/agents/reviewer') as Put[];

    expect(sent?.agent.runs_on['on_exhausted']).toBe('pause');
  });

  it('writes no key at all when the default is chosen, so the agent is stored as before', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await openEditor(user, 'Reviewer');

    await user.click(await screen.findByRole('radio', { name: /Pause and tell me/ }));
    await user.click(
      screen.getByRole('radio', { name: /Let the Director pick a substitute/ }),
    );

    // A change elsewhere makes the form saveable; the choice itself leaves nothing behind.
    await user.click(screen.getByRole('button', { name: 'Add fallback' }));
    await saveAgent(user, 'Save agent', 'back to default');
    await screen.findByText(/Saved as version/);

    const [sent] = bodiesTo(forge, 'PUT', '/settings/agents/reviewer') as Put[];

    expect(sent?.agent.runs_on).not.toHaveProperty('on_exhausted');
  });

  it('is a labelled group of radio buttons the keyboard can reach', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await openEditor(user, 'Reviewer');

    const pause = await screen.findByRole('radio', { name: /Pause and tell me/ });

    pause.focus();
    await user.keyboard(' ');

    expect(pause).toBeChecked();
  });
});
