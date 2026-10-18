/**
 * Pins: the Director's memory-retrieval settings on the Forge Director page and in a project's
 * override: the model for the step that rewrites a question into search words, the on/off and
 * numbers (timeout, budget, relevant decisions, pinned, rejected approaches listed), the note
 * that rejected approaches are always all listed, a save that writes only what changed, and a
 * number outside the schema's range refused before the server is asked.
 *
 * Why: these dials decide how much of a project's memory the Director sees and how much a card
 * spends finding it. A switch that cannot turn the extra model call off, a budget that saves a
 * negative number, or a screen that does not say rejected approaches are never ranked away (so
 * the owner fears a low "relevant" number hides one) would each take that choice, or that
 * reassurance, away.
 * Depends on: routes/settings/director-page, routes/project-settings/director-override,
 * helpers/render-settings, helpers/render-screens, helpers/director-page. jsdom.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { lastCompanyPut, saveVersion } from '#tests/helpers/director-page.js';
import { renderScreens } from '#tests/helpers/render-screens.js';
import { renderSettings } from '#tests/helpers/render-settings.js';

describe('Director page: memory retrieval', () => {
  it('has a model and a timeout for the rewrite step', async () => {
    renderSettings('/settings/director');
    await screen.findByText('Model per step');

    expect(
      screen.getByRole('combobox', { name: 'Memory search words' }),
    ).toHaveTextContent('Haiku');

    expect(screen.getByLabelText('Memory search words may run up to')).toHaveValue(30);
  });

  it('shows every setting with its value, and says rejected approaches are always listed', async () => {
    renderSettings('/settings/director');
    await screen.findByText('Memory retrieval');

    expect(
      screen.getByRole('switch', { name: 'Rewrite a question into search words' }),
    ).toBeChecked();

    expect(screen.getByLabelText('Rewrite may run up to')).toHaveValue(15);
    expect(screen.getByLabelText('Budget for one rewrite')).toHaveValue(0.25);
    expect(screen.getByLabelText('Relevant decisions per step')).toHaveValue(8);
    expect(screen.getByLabelText('Pinned decisions per step')).toHaveValue(12);
    expect(screen.getByLabelText('Rejected approaches listed')).toHaveValue(25);
    expect(
      screen.getByText(/Rejected approaches are always all listed to the Director/),
    ).toBeVisible();
  });

  it('saves a switched-off rewrite as just that key', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    await screen.findByText('Memory retrieval');

    await user.click(
      screen.getByRole('switch', { name: 'Rewrite a question into search words' }),
    );

    await saveVersion(user, 'No extra model call');

    expect(await screen.findByText('Saved as a new version')).toBeInTheDocument();
    expect(lastCompanyPut(forge)).toMatchObject({
      doc: { director: { memory: { rewrite: false } } },
    });
  });

  it('saves a timeout typed in seconds as milliseconds', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    const box = await screen.findByLabelText('Rewrite may run up to');

    await user.clear(box);
    await user.type(box, '20');
    await saveVersion(user, 'More time');

    expect(await screen.findByText('Saved as a new version')).toBeInTheDocument();
    expect(lastCompanyPut(forge)).toMatchObject({
      doc: { director: { memory: { rewrite_timeout_ms: 20_000 } } },
    });
  });

  it('refuses numbers outside the range, in words, and blocks the save', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    const top = await screen.findByLabelText('Relevant decisions per step');

    await user.clear(top);
    await user.type(top, '99');

    expect(await screen.findByText('Must be at most 15.')).toBeVisible();

    const budget = screen.getByLabelText('Budget for one rewrite');
    await user.clear(budget);
    await user.type(budget, '5');

    expect(await screen.findByText('Must be at most 2 USD.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save as version 3' })).toBeDisabled();
    expect(forge.stub.callsTo('PUT /settings/company')).toHaveLength(0);
  });
});

describe('project Director override: memory retrieval', () => {
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
        'Rewrites questions, 12 pinned and 8 relevant decisions, up to 25 rejected approaches',
      ),
    ).toBeVisible();

    await user.click(
      screen.getByRole('switch', { name: 'Override Director memory retrieval' }),
    );

    expect(
      screen.getByRole('switch', { name: 'Rewrite a question into search words' }),
    ).toBeChecked();

    expect(screen.getByLabelText('Relevant decisions per step')).toHaveValue(8);
  });

  it('refuses a number outside the range before the server is asked', async () => {
    const user = userEvent.setup();
    const { forge } = renderScreens(PATH);
    await ready();

    await user.click(
      screen.getByRole('switch', { name: 'Override Director memory retrieval' }),
    );

    const rejected = screen.getByLabelText('Rejected approaches listed');

    await user.clear(rejected);
    await user.type(rejected, '2');

    expect(
      await screen.findByText(/Memory needs a rewrite timeout of 1 to 60 seconds/),
    ).toBeVisible();

    await user.type(screen.getByLabelText('Reason for this change'), 'try');

    expect(screen.getByRole('button', { name: 'Save as v4' })).toBeDisabled();
    expect(forge.stub.callsTo('PUT /settings/projects/sample-service')).toHaveLength(0);
  });
});
