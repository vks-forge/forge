/**
 * Pins: the GitHub screen lists connections without any key, validates the add form inline,
 * empties the private-key field after a successful add, and shows empty and error states.
 *
 * Why: the private key lets anyone act as the GitHub App. It must go to Forge once and never
 *   be rendered back, and a half-pasted key must be caught here, in words, not as a failed
 *   server call.
 * Depends on: src/routes/settings/github-page, helpers/render-settings. jsdom.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderSettings } from '#tests/helpers/render-settings.js';

const PEM = '-----BEGIN RSA PRIVATE KEY-----\nSECRETBYTES\n-----END RSA PRIVATE KEY-----';

describe('GitHub connections', () => {
  it('lists connections and never shows a key', async () => {
    renderSettings('/settings/github');

    const list = await screen.findByRole('list', { name: 'GitHub connections' });

    expect(list).toHaveTextContent('sample-org');
    expect(list).toHaveTextContent('Active');
    expect(list).toHaveTextContent('cannot be shown');
    expect(document.body.textContent).not.toContain('BEGIN');
  });

  it('explains an empty list', async () => {
    renderSettings('/settings/github', { scenario: 'empty' });

    expect(await screen.findByText('No GitHub connection yet')).toBeVisible();
  });

  it('shows what failed when Forge cannot be reached', async () => {
    renderSettings('/settings/github', { scenario: 'error' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach Forge');
  });

  it('catches a bad App id and a half-pasted key inline', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/github');
    await user.click(await screen.findByRole('button', { name: 'Add connection' }));

    await user.type(screen.getByLabelText('GitHub account or organisation'), 'acme');
    await user.type(screen.getByLabelText('App ID'), 'abc');
    await user.type(screen.getByLabelText('Private key (.pem)'), 'not a key');
    await user.click(screen.getAllByRole('button', { name: 'Add connection' }).at(-1)!);

    expect(await screen.findByText('The App ID is a number.')).toBeVisible();
    expect(screen.getByText(/Paste the whole .pem file/)).toBeVisible();
  });

  it('adds a connection and clears the key from the page', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/github');
    await user.click(await screen.findByRole('button', { name: 'Add connection' }));

    await user.type(screen.getByLabelText('GitHub account or organisation'), 'acme');
    await user.type(screen.getByLabelText('App ID'), '777');
    await user.click(screen.getByLabelText('Private key (.pem)'));
    await user.paste(PEM);
    await user.click(screen.getAllByRole('button', { name: 'Add connection' }).at(-1)!);

    expect(await screen.findByText('Connection added')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'GitHub connections' })).toHaveTextContent(
        'acme',
      ),
    );

    expect(screen.queryByLabelText('Private key (.pem)')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('SECRETBYTES');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens Add connection in a dialog that a backdrop click does not close', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSettings('/settings/github');
    await user.click(await screen.findByRole('button', { name: 'Add connection' }));

    const dialog = await screen.findByRole('dialog', { name: 'Add a GitHub connection' });
    await user.type(screen.getByLabelText('GitHub account or organisation'), 'acme');
    await user.click(document.body);

    expect(dialog).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      await screen.findByRole('alertdialog', { name: 'Discard this connection?' }),
    ).toBeVisible();
  });
});
