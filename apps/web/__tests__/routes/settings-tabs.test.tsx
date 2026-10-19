/**
 * Pins: settings are tabs that are URLs: Forge settings and project settings each show the
 * section of their URL, the bare settings URL redirects to a first section, a harness page
 * highlights Harnesses, the arrow keys move between tabs, a phone gets a picker instead of the
 * list, and a project's draft and save bar survive a tab switch while leaving settings still
 * asks first.
 *
 * Why: the tabs replaced one long page. If a tab URL showed the wrong section, a tab switch
 * dropped half-typed edits, or the leave guard fired on every tab click (or never), the owner
 * would either lose work or fight the screen. Each is pinned over the stubbed Forge server.
 * Depends on: routes/settings, routes/project-settings, components/settings/settings-layout,
 * helpers/render-app, helpers/match-media, helpers/choose.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { choose } from '#tests/helpers/choose.js';
import { setMatchMedia } from '#tests/helpers/match-media.js';
import { renderApp } from '#tests/helpers/render-app.js';

const BASE = '/p/sample-service/settings';
const NARROW = (query: string): boolean => query.includes('max-width: 767px');

const forgeTabs = (): HTMLElement =>
  screen.getByRole('navigation', { name: 'Settings sections' });

const projectTabs = (): HTMLElement =>
  screen.getByRole('navigation', { name: 'Project settings sections' });

const current = (nav: HTMLElement): HTMLElement[] =>
  within(nav)
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page');

afterEach(() => setMatchMedia());

describe('Forge settings tabs', () => {
  it('lists the sections in order and marks the one in the URL', async () => {
    renderApp({ path: '/settings/limits' });
    await screen.findByRole('heading', { name: 'Limits', level: 1 });

    const links = within(forgeTabs()).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'General',
      'Director',
      'Agents',
      'Pipelines',
      'Limits',
      'Research',
      'Harnesses',
      'GitHub',
    ]);

    expect(current(forgeTabs())).toEqual([
      within(forgeTabs()).getByRole('link', { name: 'Limits' }),
    ]);
  });

  it('opens the section of each URL', async () => {
    renderApp({ path: '/settings/general' });

    expect(
      await screen.findByRole('heading', { name: 'General', level: 1 }),
    ).toBeVisible();
  });

  it('sends the bare settings URL to General', async () => {
    const { router } = renderApp({ path: '/settings' });

    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/general'));
  });

  it('keeps Harnesses highlighted on a harness page', async () => {
    renderApp({ path: '/settings/harnesses/claude' });
    await screen.findByRole('navigation', { name: 'Settings sections' });

    expect(current(forgeTabs()).map((link) => link.textContent)).toEqual(['Harnesses']);
  });

  it('moves focus with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/settings/limits' });
    await screen.findByRole('heading', { name: 'Limits', level: 1 });

    const tabs = within(forgeTabs());
    const active = tabs.getByRole('link', { name: 'Limits' });

    expect(active).toHaveAttribute('tabindex', '0');
    expect(tabs.getByRole('link', { name: 'General' })).toHaveAttribute('tabindex', '-1');

    active.focus();
    await user.keyboard('{ArrowDown}');
    expect(tabs.getByRole('link', { name: 'Research' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(tabs.getByRole('link', { name: 'Harnesses' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(tabs.getByRole('link', { name: 'GitHub' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(tabs.getByRole('link', { name: 'General' })).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(tabs.getByRole('link', { name: 'GitHub' })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(tabs.getByRole('link', { name: 'General' })).toHaveFocus();
  });

  it('folds the tabs into a picker on a phone and navigates from it', async () => {
    setMatchMedia(NARROW);
    const user = userEvent.setup();
    const { router } = renderApp({ path: '/settings/limits' });
    await screen.findByRole('heading', { name: 'Limits', level: 1 });

    expect(screen.queryByRole('navigation', { name: 'Settings sections' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Settings sections' })).toHaveTextContent(
      'Limits',
    );

    await choose(user, 'Settings sections', 'GitHub');

    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/github'));
  });
});

describe('project settings tabs', () => {
  it('sends the bare URL to the first section', async () => {
    const { router } = renderApp({ path: BASE });

    await waitFor(() => expect(router.state.location.pathname).toBe(`${BASE}/project`));
  });

  it.each([
    ['project', 'Project'],
    ['workers', 'Workers'],
    ['checks', 'Checks'],
    ['repository', 'Repository'],
    ['director', 'Director for this project'],
    ['agents', 'Agents for this project'],
    ['history', 'History'],
    ['danger', 'Archive project'],
  ])('shows the %s section at its own URL', async (segment, heading) => {
    renderApp({ path: `${BASE}/${segment}` });

    expect(await screen.findByRole('heading', { name: heading, level: 2 })).toBeVisible();
    expect(current(projectTabs())).toHaveLength(1);
  });

  it('keeps the draft and the save bar when switching tabs', async () => {
    const user = userEvent.setup();
    renderApp({ path: `${BASE}/workers` });

    await user.click(
      await screen.findByRole('switch', { name: 'Override Fallback harnesses' }),
    );

    expect(screen.getByRole('button', { name: 'Save as v4' })).toBeVisible();

    await user.click(within(projectTabs()).getByRole('link', { name: 'Checks' }));

    expect(
      await screen.findByRole('heading', { name: 'Checks', level: 2 }),
    ).toBeVisible();

    expect(screen.getByLabelText('Reason for this change')).toBeVisible();

    await user.click(within(projectTabs()).getByRole('link', { name: 'Workers' }));

    expect(
      await screen.findByRole('switch', { name: 'Override Fallback harnesses' }),
    ).toBeChecked();
  });

  it('does not ask when moving between tabs, but asks when leaving settings', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: `${BASE}/workers` });

    await user.click(
      await screen.findByRole('switch', { name: 'Override Fallback harnesses' }),
    );

    await user.click(within(projectTabs()).getByRole('link', { name: 'History' }));

    expect(router.state.location.pathname).toBe(`${BASE}/history`);
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull();

    await user.click(screen.getAllByRole('link', { name: 'Board' })[0] as HTMLElement);

    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`${BASE}/history`);
  });

  it('folds the tabs into a picker on a phone', async () => {
    setMatchMedia(NARROW);
    const user = userEvent.setup();
    const { router } = renderApp({ path: `${BASE}/project` });
    await screen.findByRole('heading', { name: 'Project settings', level: 1 });

    expect(
      screen.queryByRole('navigation', { name: 'Project settings sections' }),
    ).toBeNull();

    await choose(user, 'Project settings sections', 'Checks');

    await waitFor(() => expect(router.state.location.pathname).toBe(`${BASE}/checks`));
  });
});
