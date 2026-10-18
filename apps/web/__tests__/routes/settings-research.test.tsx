/**
 * Pins: Forge settings, Research: the provider and address, the host lists and the page
 * timeout are edited and saved as just the keys that changed; a bad address or timeout is
 * refused in words under its field before any request; and "Test provider" tries the settings
 * on screen (saved or not) and reports the latency, or the cause and the fix in plain words.
 *
 * Why: research is the one place Forge reaches the open web, and its provider is usually a
 *   program on this machine that is not running. An owner who cannot tell whether it works finds
 *   out when a plan comes back without sources. The test button is that answer, and a failure
 *   that says only "unreachable" is no answer: each kind of failure must say what to do.
 * Depends on: routes/settings/research-page, components/research/*, helpers/render-settings,
 *   helpers/director-page.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose, chosen } from '#tests/helpers/choose.js';
import { lastCompanyPut, saveVersion } from '#tests/helpers/director-page.js';
import { json } from '#tests/helpers/fetch-stub.js';
import { renderSettings } from '#tests/helpers/render-settings.js';

const PATH = '/settings/research';
const TEST = 'POST /settings/research/test';

async function ready(): Promise<void> {
  await screen.findByRole('heading', { name: 'Search provider' });
}

describe('Research settings: editing', () => {
  it('opens on the shipped defaults, with a tab for it among the Forge settings', async () => {
    renderSettings(PATH);
    await ready();

    expect(chosen('Provider')).toContain('SearXNG');
    expect(screen.getByLabelText('SearXNG address')).toHaveValue('http://localhost:8888');
    expect(screen.getByLabelText('Give up on a page after')).toHaveValue(10);
    expect(screen.getByLabelText('Only read these hosts')).toHaveValue('');
    expect(
      within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole(
        'link',
        {
          name: 'Research',
        },
      ),
    ).toHaveAttribute('aria-current', 'page');

    expect(screen.getByRole('link', { name: 'Director page' })).toHaveAttribute(
      'href',
      '/settings/director',
    );
  });

  it('saves the address, the three host lists and the timeout as one new version', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings(PATH);
    await ready();

    const address = screen.getByLabelText('SearXNG address');
    await user.clear(address);
    await user.type(address, 'http://search.internal:9000');
    await user.type(
      screen.getByLabelText('Other hosts allowed for SearXNG'),
      'search.internal',
    );

    await user.type(
      screen.getByLabelText('Only read these hosts'),
      'docs.example.com{Enter}api.example.com',
    );

    await user.type(screen.getByLabelText('Never read these hosts'), 'ads.example.net');

    const timeout = screen.getByLabelText('Give up on a page after');
    await user.clear(timeout);
    await user.type(timeout, '20');
    await saveVersion(user, 'Use the team search box');

    expect(await screen.findByText('Saved as a new version')).toBeInTheDocument();
    expect(lastCompanyPut(forge).doc['research']).toEqual({
      searxng: {
        base_url: 'http://search.internal:9000',
        allow_hosts: ['search.internal'],
      },
      fetch: {
        allow_hosts: ['docs.example.com', 'api.example.com'],
        deny_hosts: ['ads.example.net'],
        timeout_ms: 20_000,
      },
    });
  });

  it('switches the provider off and says research is then off, keeping the other fields', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings(PATH);
    await ready();

    await choose(user, 'Provider', 'Off');

    expect(
      screen.getByText(/Research is off\. The address and host fields below are kept/),
    ).toBeVisible();

    await saveVersion(user, 'No web access for now');
    await screen.findByText('Saved as a new version');

    expect(lastCompanyPut(forge).doc['research']).toEqual({ provider: 'none' });
  });

  it('refuses an address that is not a web address, under its own field', async () => {
    const user = userEvent.setup();
    renderSettings(PATH);
    await ready();

    const address = screen.getByLabelText('SearXNG address');
    await user.clear(address);
    await user.type(address, 'not a url');

    expect(address).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByRole('alert')).toBeVisible();
  });

  it('says a timeout under one second is too small, in seconds', async () => {
    const user = userEvent.setup();
    renderSettings(PATH);
    await ready();

    const timeout = screen.getByLabelText('Give up on a page after');
    await user.clear(timeout);
    await user.type(timeout, '0.5');

    expect(await screen.findByText('Must be at least 1 s.')).toBeVisible();

    await user.clear(timeout);
    await user.type(timeout, '60');

    expect(await screen.findByText('Must be at most 30 s.')).toBeVisible();
  });

  it('follows Discard, putting the typed hosts back as they were saved', async () => {
    const user = userEvent.setup();
    renderSettings(PATH);
    await ready();

    const deny = screen.getByLabelText('Never read these hosts');
    await user.type(deny, 'ads.example.net');
    await user.click(await screen.findByRole('button', { name: 'Discard edits' }));

    await waitFor(() => expect(deny).toHaveValue(''));
  });
});

describe('Research settings: Test provider', () => {
  it('says how fast the provider answered, testing the settings on screen without saving', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings(PATH, {
      routes: { [TEST]: json({ ok: true, provider: 'searxng', latency_ms: 84 }) },
    });

    await ready();

    const address = screen.getByLabelText('SearXNG address');
    await user.clear(address);
    await user.type(address, 'http://localhost:9999');
    await user.click(screen.getByRole('button', { name: 'Test provider' }));

    expect(
      await screen.findByText('The search provider answered in 84 ms.'),
    ).toBeVisible();

    expect(forge.stub.callsTo(TEST)[0]?.body).toMatchObject({
      research: { provider: 'searxng', searxng: { base_url: 'http://localhost:9999' } },
    });

    expect(forge.stub.callsTo('PUT /settings/company')).toHaveLength(0);
    expect(screen.getByText(/Nothing is saved/)).toBeVisible();
  });

  it('names the cause and the fix when the provider is not running', async () => {
    const user = userEvent.setup();
    renderSettings(PATH, {
      routes: {
        [TEST]: json({
          ok: false,
          provider: 'searxng',
          error: {
            kind: 'unreachable',
            message: 'Nothing answered at http://localhost:8888.',
          },
        }),
      },
    });

    await ready();
    await user.click(screen.getByRole('button', { name: 'Test provider' }));

    expect(
      await screen.findByText('Nothing answered at http://localhost:8888.'),
    ).toBeVisible();

    expect(screen.getByText(/Start SearXNG \(it is not running\)/)).toBeVisible();
  });

  it('gives a different fix for a provider that is switched off', async () => {
    const user = userEvent.setup();
    renderSettings(PATH, {
      routes: {
        [TEST]: json({
          ok: false,
          provider: 'none',
          error: { kind: 'not_configured', message: 'Research is switched off.' },
        }),
      },
    });

    await ready();
    await user.click(screen.getByRole('button', { name: 'Test provider' }));

    expect(await screen.findByText('Research is switched off.')).toBeVisible();
    expect(screen.getByText(/Choose SearXNG as the provider/)).toBeVisible();
  });

  it('says it could not reach Forge when the test call itself fails', async () => {
    const user = userEvent.setup();
    renderSettings(PATH, { routes: { [TEST]: { networkError: true } } });

    await ready();
    await user.click(screen.getByRole('button', { name: 'Test provider' }));

    expect(await screen.findByText('Cannot reach Forge')).toBeVisible();
  });

  it('is disabled with the reason beside it while a field is wrong', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings(PATH);
    await ready();

    const address = screen.getByLabelText('SearXNG address');
    await user.clear(address);
    await user.type(address, 'nope');

    const button = screen.getByRole('button', { name: 'Test provider' });

    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Fix the fields marked above first.');
    expect(forge.stub.callsTo(TEST)).toHaveLength(0);
  });
});
