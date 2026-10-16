/**
 * Pins: the Harnesses screens list what is installed, keep credentials write-only, show a
 * compatibility check running and finishing, make every tool decision go through a confirm
 * that asks for a reason, and show loading, empty and error states.
 *
 * Why: this is where a user hands Forge an API key and decides which harness tools Workers
 *   may use. A stored key shown back, an approval from a stray click, or a check that looks
 *   hung would each break trust in the control room's most security-relevant screen.
 * Depends on: src/routes/settings/*, src/components/settings/*, helpers/render-settings. jsdom.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderSettings } from '#tests/helpers/render-settings.js';

describe('harness list', () => {
  it('shows the installed harness with version, build, sign-in and status', async () => {
    renderSettings('/settings/harnesses');

    const row = await screen.findByRole('link', { name: /claude/ }, { timeout: 5000 });

    expect(row).toHaveTextContent('Working');
    expect(row).toHaveTextContent('Signed-in account');
    await waitFor(() => expect(row).toHaveTextContent('2.1.142'));
    expect(screen.getByRole('heading', { name: 'Harnesses', level: 1 })).toBeVisible();
  });

  it('offers setup when nothing is registered', async () => {
    renderSettings('/settings/harnesses', { scenario: 'empty' });

    expect(await screen.findByText('No harness is set up yet')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Set up Claude Code' })).toHaveAttribute(
      'href',
      '/settings/harnesses/claude',
    );
  });

  it('says what failed and offers a retry when Forge cannot be reached', async () => {
    renderSettings('/settings/harnesses', { scenario: 'error' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach Forge');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
});

describe('harness detail: credential', () => {
  it('never shows a stored secret and clears the field after saving', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/harnesses/claude');
    await user.click(await screen.findByRole('radio', { name: /API key/ }));
    await user.click(screen.getByRole('button', { name: 'Save sign-in settings' }));
    await screen.findByText('Saved');

    const field = await screen.findByLabelText('Paste the API key');

    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveValue('');
    expect(screen.getByText('Not stored yet')).toBeVisible();

    await user.type(field, 'sk-ant-secret-value');
    await user.click(screen.getByRole('button', { name: 'Store API key' }));

    expect(await screen.findByText('API key stored')).toBeInTheDocument();
    expect(screen.getByText('Stored')).toBeVisible();
    expect(screen.getByLabelText('Replace the API key')).toHaveValue('');
    expect(document.body.textContent).not.toContain('sk-ant-secret-value');
  });

  it('refuses a key with spaces before sending it', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/harnesses/claude');
    await user.click(await screen.findByRole('radio', { name: /API key/ }));
    await user.click(screen.getByRole('button', { name: 'Save sign-in settings' }));

    await user.type(await screen.findByLabelText('Paste the API key'), 'two words');
    await user.click(screen.getByRole('button', { name: 'Store API key' }));

    expect(await screen.findByText(/no spaces or line breaks/)).toBeVisible();
    expect(screen.queryByText('API key stored')).not.toBeInTheDocument();
  });

  it('tests the harness and shows the result in words', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/harnesses/claude');

    await user.click(await screen.findByRole('button', { name: 'Test harness' }));

    expect(await screen.findByText('The harness works')).toBeInTheDocument();
    const result = screen.getByText('The harness works').closest('[role="status"]');

    expect(
      within(result as HTMLElement).getByText('Signed-in account', { selector: 'dd' }),
    ).toBeInTheDocument();
  });
});

describe('harness detail: compatibility', () => {
  it('shows a running check, then its checks, without a reload', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/harnesses/claude');

    await user.click(
      await screen.findByRole('button', { name: 'Run compatibility check' }),
    );

    expect(await screen.findByText(/Checking build 2\.1\.142/)).toBeVisible();
    expect(
      await screen.findByText(/This build behaves the way Forge needs/, undefined, {
        timeout: 5000,
      }),
    ).toBeVisible();

    expect(
      within(document.getElementById('compat') as HTMLElement).getByText('Compatible'),
    ).toBeVisible();
  });
});

describe('harness detail: tool approvals', () => {
  it('lists the tool needing approval first, flagged', async () => {
    renderSettings('/settings/harnesses/claude');

    const list = await screen.findByRole('list', { name: 'Built-in tools' });

    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('shell');
    expect(screen.getByText(/1 tool needs your decision/)).toBeVisible();
  });

  it('does nothing when the confirm is cancelled', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/harnesses/claude');

    await user.click(await screen.findByRole('button', { name: 'Approve shell' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Approve shell?');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );

    expect(screen.getByText(/1 tool needs your decision/)).toBeVisible();
  });

  it('needs a name and a reason, then approves and records them', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/harnesses/claude');

    await user.click(await screen.findByRole('button', { name: 'Approve shell' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Approve tool' }));

    expect(await within(dialog).findByText('Say who is deciding.')).toBeVisible();
    expect(within(dialog).getByText(/Give a short reason/)).toBeVisible();

    await user.type(within(dialog).getByLabelText('Your name'), 'Vik');
    await user.type(within(dialog).getByLabelText('Reason'), 'Reviewed the new flag');
    await user.click(within(dialog).getByRole('button', { name: 'Approve tool' }));

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );

    expect(await screen.findByText(/Approved by Vik/)).toBeVisible();
    expect(screen.queryByText(/need your decision/)).not.toBeInTheDocument();
  });

  it('approves every pending tool with one confirm, one request per tool', async () => {
    const user = userEvent.setup();
    const pending = (tool: string, digit: string) => ({
      harness_kind: 'claude',
      version: '2.1.142',
      tool,
      schema_hash: `sha256:${digit.repeat(64)}`,
      status: 'pending',
    });

    const { forge } = renderSettings('/settings/harnesses/claude', {
      routes: {
        'GET /harnesses/:id/tools': {
          body: {
            version: '2.1.142',
            tools: [pending('shell', 'a'), pending('write', 'b'), pending('grep', 'c')],
          },
        },
        'POST /harnesses/:id/tools/:tool/:decision': ({ params }) => ({
          body: {
            ...pending(params['tool']!, 'a'),
            status: 'approved',
            decided_by: 'Vik',
            decided_at: '2026-10-16T10:00:00.000Z',
            decision_reason: 'Reviewed the update',
          },
        }),
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Approve all (3)' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Approve 3 tools?');
    expect(dialog).toHaveTextContent('grep, shell, write');

    await user.type(within(dialog).getByLabelText('Your name'), 'Vik');
    await user.type(within(dialog).getByLabelText('Reason'), 'Reviewed the update');
    await user.click(within(dialog).getByRole('button', { name: 'Approve 3 tools' }));

    await waitFor(() =>
      expect(
        forge.stub.callsTo('POST /harnesses/:id/tools/:tool/:decision'),
      ).toHaveLength(3),
    );

    const paths = forge.stub
      .callsTo('POST /harnesses/:id/tools/:tool/:decision')
      .map((c) => c.path);

    expect(paths).toEqual([
      '/harnesses/claude/tools/grep/approve',
      '/harnesses/claude/tools/shell/approve',
      '/harnesses/claude/tools/write/approve',
    ]);
  });

  it('offers no Approve all for a single pending tool', async () => {
    renderSettings('/settings/harnesses/claude');

    await screen.findByRole('button', { name: 'Approve shell' });

    expect(screen.queryByRole('button', { name: /Approve all/ })).not.toBeInTheDocument();
  });

  it('mirrors the running check into a live notification that ends as a verdict', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/harnesses/claude');

    await user.click(
      await screen.findByRole('button', { name: 'Run compatibility check' }),
    );

    expect(await screen.findByText('Checking Claude Code')).toBeInTheDocument();
    expect(
      await screen.findByText('Claude Code is compatible', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});
