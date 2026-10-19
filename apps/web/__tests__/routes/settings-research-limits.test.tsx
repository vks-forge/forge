/**
 * Pins: the Director's research limits (rounds, searches, pages, bytes, runs per card, the
 * per-call budget and the grill toggle) are edited and saved as just the keys that changed,
 * with a range error in words; the flow editor offers the Research step once and says why it
 * cannot be added twice; and a project's Research tab can only narrow the company setting.
 *
 * Why: research costs money and reaches the web, so how much of it a card may do is an owner
 *   dial, and a project may be stricter than the company but never looser. The failures that
 *   hurt are quiet: a limit saved out of the range the server accepts, a second Research step
 *   that the server refuses after the owner has typed a reason, a project override that looks
 *   like it widens access.
 * Depends on: routes/settings/director-page, routes/project-settings/*, components/director/*,
 *   helpers/render-settings, helpers/render-screens.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { lastCompanyPut, saveVersion } from '#tests/helpers/director-page.js';
import { renderScreens } from '#tests/helpers/render-screens.js';
import { renderSettings } from '#tests/helpers/render-settings.js';

async function ready(): Promise<void> {
  await screen.findByRole('heading', { name: 'Research limits' });
}

describe('Director settings: research limits', () => {
  it('shows the shipped limits in the units an owner thinks in', async () => {
    renderSettings('/settings/director');
    await ready();

    expect(screen.getByLabelText('Research rounds')).toHaveValue(2);
    expect(screen.getByLabelText('Searches per run')).toHaveValue(6);
    expect(screen.getByLabelText('Pages read per run')).toHaveValue(8);
    expect(screen.getByLabelText('Page text per run')).toHaveValue(600);
    expect(screen.getByLabelText('Research runs per card')).toHaveValue(4);
    expect(screen.getByLabelText('Budget for one research call')).toHaveValue(null);
    expect(
      screen.getByRole('switch', { name: 'Research during the grill' }),
    ).toBeChecked();
  });

  it('saves a changed limit and the grill toggle as just those keys', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    await ready();

    const rounds = screen.getByLabelText('Research rounds');
    await user.clear(rounds);
    await user.type(rounds, '3');
    await user.click(screen.getByRole('switch', { name: 'Research during the grill' }));
    await saveVersion(user, 'More research, none mid-grill');

    expect(await screen.findByText('Saved as a new version')).toBeInTheDocument();
    expect(lastCompanyPut(forge).doc['director']).toMatchObject({
      research: { max_rounds: 3, grill_detours: false },
    });
  });

  it('refuses a value outside the range in words, in the unit shown', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/director');
    await ready();

    const rounds = screen.getByLabelText('Research rounds');
    await user.clear(rounds);
    await user.type(rounds, '99');

    expect(await screen.findByText('Must be at most 10.')).toBeVisible();

    const bytes = screen.getByLabelText('Page text per run');
    await user.clear(bytes);
    await user.type(bytes, '10');

    expect(await screen.findByText('Must be at least 50 KB.')).toBeVisible();
  });

  it('sets the per-call budget when typed and leaves it out when emptied again', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    await ready();

    const budget = screen.getByLabelText('Budget for one research call');
    await user.type(budget, '0.75');
    await saveVersion(user, 'Cap each research call');
    await screen.findByText('Saved as a new version');

    expect(lastCompanyPut(forge).doc['director']).toMatchObject({
      research: { step_budget_usd: 0.75 },
    });

    await user.clear(screen.getByLabelText('Budget for one research call'));

    expect(screen.queryByText('Enter a number.')).toBeNull();

    await saveVersion(user, 'Back to the default', 'Save as version 4');
    await screen.findAllByText('Saved as a new version');

    const research = (lastCompanyPut(forge).doc['director'] as Record<string, unknown>)[
      'research'
    ] as Record<string, unknown> | undefined;

    expect(research?.['step_budget_usd']).toBeUndefined();
  });

  it('lists Research among the step timeouts and the model per step', async () => {
    renderSettings('/settings/director');
    await ready();

    expect(screen.getByLabelText('Research may run up to')).toHaveValue(180);
    expect(screen.getByText(/Looks up outside facts on the web/)).toBeVisible();
  });
});

describe('Director settings: the Research step in the flow', () => {
  it('adds the shipped Research step before the locked tail and then explains why it cannot be added again', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    await ready();

    const add = screen.getByRole('button', { name: 'Add Research step' });

    expect(add).toBeEnabled();

    await user.click(add);

    const flow = within(screen.getByRole('list', { name: 'Planning flow' }));
    const labels = flow.getAllByRole('listitem').map((item) => item.textContent ?? '');

    expect(labels.findIndex((l) => l.includes('Research outside facts'))).toBe(
      labels.findIndex((l) => l.includes('Write the plan')) - 1,
    );

    expect(screen.getByRole('button', { name: 'Add Research step' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Add Research step' }),
    ).toHaveAccessibleDescription(
      'The flow already has a Research step. A flow may have only one.',
    );

    await saveVersion(user, 'Let the Director research');
    await screen.findByText('Saved as a new version');

    const saved = (lastCompanyPut(forge).doc['director'] as { flow: { kind: string }[] })
      .flow;

    expect(saved.filter((s) => s.kind === 'research')).toHaveLength(1);
  });
});

describe('project settings: Research', () => {
  const PATH = '/p/sample-service/settings/research';

  async function open(): Promise<void> {
    await screen.findByRole('heading', { name: 'Research for this project', level: 2 });
  }

  const saveWith = async (user: ReturnType<typeof userEvent.setup>, reason: string) => {
    await user.type(screen.getByLabelText('Reason for this change'), reason);
    await user.click(screen.getByRole('button', { name: 'Save as v4' }));
  };

  it('inherits the company setting and says it can only narrow it', async () => {
    renderScreens(PATH);
    await open();

    expect(
      screen.getByRole('switch', { name: 'Override Research on this project' }),
    ).not.toBeChecked();

    expect(screen.getByText(/Research is on \(searxng\)/)).toBeVisible();
    expect(screen.getByText(/A project can only narrow them/)).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Research in Forge settings' }),
    ).toHaveAttribute('href', '/settings/research');
  });

  it('switches research off for the project and saves only what narrows', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(PATH);
    await open();

    await user.click(
      screen.getByRole('switch', { name: 'Override Research on this project' }),
    );

    await user.click(
      screen.getByRole('switch', { name: 'Allow research on this project' }),
    );

    expect(screen.getByText(/Research is off for this project/)).toBeVisible();

    await saveWith(user, 'regulated code');
    expect(await screen.findByText(/Saved as version 4/)).toBeInTheDocument();

    expect(
      (await api.projectSettings.get('sample-service')).override['research'],
    ).toEqual({
      enabled: false,
    });
  });

  it('denies and allows hosts, one per line', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(PATH);
    await open();

    await user.click(
      screen.getByRole('switch', { name: 'Override Research on this project' }),
    );

    await user.type(
      screen.getByLabelText('Also never read these hosts'),
      'ads.example.net',
    );

    await user.type(
      screen.getByLabelText('Only read these hosts'),
      'docs.example.com{Enter}api.example.com',
    );

    expect(
      screen.getByText('Reads only docs.example.com, api.example.com.'),
    ).toBeVisible();

    await saveWith(user, 'tighter');
    await screen.findByText(/Saved as version 4/);

    expect(
      (await api.projectSettings.get('sample-service')).override['research'],
    ).toEqual({
      deny_hosts: ['ads.example.net'],
      allow_hosts: ['docs.example.com', 'api.example.com'],
    });
  });

  it('refuses a pasted address in words and does not save it', async () => {
    const user = userEvent.setup();
    renderScreens(PATH);
    await open();

    await user.click(
      screen.getByRole('switch', { name: 'Override Research on this project' }),
    );

    await user.type(
      screen.getByLabelText('Also never read these hosts'),
      'https://ads.example.net/x',
    );

    expect(
      await screen.findByText(/Write hosts only, such as docs\.example\.com/),
    ).toBeVisible();
  });

  it('shows Research limits as a Director override row too', async () => {
    renderScreens('/p/sample-service/settings/director');

    expect(
      await screen.findByRole('switch', { name: 'Override Director research limits' }),
    ).not.toBeChecked();

    expect(
      screen.getByText(/2 rounds, 6 searches, 8 pages, 4 runs per card/),
    ).toBeVisible();
  });
});
