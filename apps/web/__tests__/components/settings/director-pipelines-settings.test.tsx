/**
 * Pins: the Director's pipeline settings on the Forge Director page and in a project's override: a
 * model for the step that picks a substitute agent, the on/off for adjusting ticket pipelines, and
 * the three numbers that say when it suggests a change to a project's lane (tickets, cards, days);
 * a save writes only what changed, and a number outside its bounds is refused before the server is
 * asked.
 *
 * Why: these settings decide how much the Director may reshape the owner's lanes. A switch that
 * cannot turn adjusting off, a threshold that saves 0 and floods the Inbox, or a model row missing for
 * the substitute step (so it runs on whatever the server defaults to) would each take that choice away.
 * Depends on: routes/settings/director-page, routes/project-settings/director-override,
 * helpers/render-settings, helpers/render-screens, helpers/director-page. jsdom.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose } from '#tests/helpers/choose.js';
import { lastCompanyPut, saveVersion } from '#tests/helpers/director-page.js';
import { renderScreens } from '#tests/helpers/render-screens.js';
import { renderSettings } from '#tests/helpers/render-settings.js';

describe('Director page: ticket pipelines and the substitute step', () => {
  it('has a model for the substitute step and a timeout for it', async () => {
    renderSettings('/settings/director');
    await screen.findByText('Model per step');

    expect(
      screen.getByRole('combobox', { name: 'Pick a substitute agent' }),
    ).toHaveTextContent('Sonnet');

    expect(screen.getByLabelText('Pick a substitute agent may run up to')).toHaveValue(
      120,
    );
  });

  it('lets the substitute step be given another model', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    await screen.findByText('Model per step');

    await choose(user, 'Pick a substitute agent', 'Opus');
    await saveVersion(user, 'A stronger substitute picker');

    expect(await screen.findByText('Saved as a new version')).toBeInTheDocument();
    expect(lastCompanyPut(forge)).toMatchObject({
      doc: { models: { director: { pick_substitute: 'opus' } } },
    });
  });

  it('shows adjusting on, and the thresholds with their bounds', async () => {
    renderSettings('/settings/director');
    await screen.findByText('Ticket pipelines');

    expect(
      screen.getByRole('switch', { name: 'Let the Director adjust ticket pipelines' }),
    ).toBeChecked();

    expect(
      screen.getByLabelText('Suggest a project pipeline change after this many tickets'),
    ).toHaveValue(3);

    expect(screen.getByLabelText('from at least this many cards')).toHaveValue(2);
    expect(screen.getByLabelText('within this many days')).toHaveValue(30);
    expect(
      screen.getByText(/Nothing is changed until you accept the suggestion/),
    ).toBeVisible();
  });

  it('saves a switched-off adjust as just that key', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    await screen.findByText('Ticket pipelines');

    await user.click(
      screen.getByRole('switch', { name: 'Let the Director adjust ticket pipelines' }),
    );

    await saveVersion(user, 'Tickets run my lanes as written');

    expect(await screen.findByText('Saved as a new version')).toBeInTheDocument();
    expect(lastCompanyPut(forge)).toMatchObject({
      doc: { director: { pipelines: { adjust: false } } },
    });
  });

  it('saves a changed threshold', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    await screen.findByText('Ticket pipelines');

    const box = screen.getByLabelText(
      'Suggest a project pipeline change after this many tickets',
    );

    await user.clear(box);
    await user.type(box, '5');
    await saveVersion(user, 'Fewer suggestions');

    expect(await screen.findByText('Saved as a new version')).toBeInTheDocument();
    expect(lastCompanyPut(forge)).toMatchObject({
      doc: { director: { pipelines: { propose_after: 5 } } },
    });
  });
});

describe('project Director override: ticket pipelines', () => {
  const PATH = '/p/sample-service/settings/director';

  async function ready(): Promise<void> {
    await screen.findByRole('heading', { name: 'Director for this project', level: 2 });
  }

  it('inherits the company value in words, and overriding exposes the fields', async () => {
    const user = userEvent.setup();
    renderScreens(PATH);
    await ready();

    expect(
      screen.getByText(
        'Adjusts tickets; suggests after 3 tickets from 2 cards in 30 days',
      ),
    ).toBeVisible();

    await user.click(
      screen.getByRole('switch', { name: 'Override Director on ticket pipelines' }),
    );

    expect(
      screen.getByRole('switch', { name: 'Let the Director adjust ticket pipelines' }),
    ).toBeChecked();

    expect(screen.getByLabelText('within this many days')).toHaveValue(30);
  });

  it('refuses a threshold outside its bounds before the server is asked', async () => {
    const user = userEvent.setup();
    const { forge } = renderScreens(PATH);
    await ready();

    await user.click(
      screen.getByRole('switch', { name: 'Override Director on ticket pipelines' }),
    );

    const days = screen.getByLabelText('within this many days');

    await user.clear(days);
    await user.type(days, '3');

    expect(
      await screen.findByText(
        'Suggestions need 2 to 10 tickets, 1 to 5 cards and 7 to 90 days, all whole numbers.',
      ),
    ).toBeVisible();

    await user.type(screen.getByLabelText('Reason for this change'), 'try');

    expect(screen.getByRole('button', { name: 'Save as v4' })).toBeDisabled();
    expect(forge.stub.callsTo('PUT /settings/projects/sample-service')).toHaveLength(0);
  });
});
