/**
 * Pins: the memory import banner for every state the move to the database can be in: nothing
 * to move (silent), moving (with a way to check again), verified (one quiet line and a copyable
 * backup path), some files unreadable (each named with its reason, the memory still working,
 * Retry import) and failed (the reason and Retry), plus the explained refusal when an import is
 * already running and a failed status read.
 *
 * Why: the owner's memory is mid-move from a git repository into the database. If the screen
 * said nothing while files were unreadable, or hid the Retry, or implied the memory was lost, the
 * owner could not tell a healthy project from one that needs a hand. Run over the stubbed Forge
 * server in the real reply shapes.
 * Depends on: routes/memory/import-banner, the stubbed Forge server, renderScreens.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, networkDown, refusal } from '#tests/helpers/fetch-stub.js';
import { renderScreens } from '#tests/helpers/render-screens.js';
import { IMPORT_VERIFIED, notImported } from '#tests/helpers/forge-data/memory-views.js';

const PATH = '/p/sample-service/memory';
const IMPORT = 'GET /projects/:slug/memory/import';
const RETRY = 'POST /projects/:slug/memory/import';

const state = (fields: Record<string, unknown>) => ({
  ...notImported,
  files: 10,
  imported: 9,
  lenient: 2,
  ...fields,
});

const attention = state({
  state: 'needs_attention',
  rejects: [
    { path: 'decisions/d-0042.md', reason: 'no statement' },
    { path: 'outcomes/ARCHIVE.md', reason: 'not a record' },
  ],
});

afterEach(() => vi.restoreAllMocks());

describe('memory import banner', () => {
  it('says nothing when there was no old repository to move', async () => {
    renderScreens(PATH);
    await screen.findByRole('tablist', { name: 'Memory' });

    expect(
      screen.queryByText(/Migrating|migrated|could not be/i),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole('button', { name: 'Retry import' }),
    ).not.toBeInTheDocument();
  });

  it('shows one quiet line for a verified move, with the backup path to copy', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    renderScreens(PATH, { routes: { [IMPORT]: json(IMPORT_VERIFIED) } });

    expect(
      await screen.findByText(
        /Memory is stored in Forge’s database \(migrated 2026-10-18; old repository removed after backup C:\/forge-data\/backups\/pre-memory-db-20261018T085900Z\)/,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy path' }));

    expect(writeText).toHaveBeenCalledWith(IMPORT_VERIFIED.backup_path);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('says a move is running and lets the owner check again', async () => {
    const user = userEvent.setup();
    const { forge } = renderScreens(PATH, {
      routes: { [IMPORT]: json(state({ state: 'pending' })) },
    });

    expect(
      await screen.findByText(/Migrating memory to Forge’s database/),
    ).toBeInTheDocument();

    const before = forge.stub.callsTo(IMPORT).length;
    await user.click(screen.getByRole('button', { name: 'Check again' }));

    await waitFor(() =>
      expect(forge.stub.callsTo(IMPORT).length).toBeGreaterThan(before),
    );
  });

  it('names every unreadable file, says memory still works and retries to a verified move', async () => {
    const user = userEvent.setup();
    let now: unknown = attention;
    renderScreens(PATH, {
      routes: {
        [IMPORT]: () => ({ body: now }),
        [RETRY]: () => {
          now = IMPORT_VERIFIED;

          return { body: IMPORT_VERIFIED };
        },
      },
    });

    const banner = await screen.findByRole('region', { name: 'Memory migration' });

    expect(
      within(banner).getByText('Some memory files could not be read'),
    ).toBeInTheDocument();

    expect(
      within(banner).getByText(/Memory still works from the old repository/),
    ).toBeInTheDocument();

    const files = within(banner).getByRole('list', { name: 'Unreadable files' });

    expect(within(files).getByText('decisions/d-0042.md')).toBeInTheDocument();
    expect(within(files).getByText(/no statement/)).toBeInTheDocument();
    expect(within(files).getByText('outcomes/ARCHIVE.md')).toBeInTheDocument();

    await user.click(within(banner).getByRole('button', { name: 'Retry import' }));

    expect(
      await screen.findByText(/Memory is stored in Forge’s database/),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole('region', { name: 'Memory migration' }),
    ).not.toBeInTheDocument();
  });

  it('shows why a move failed and offers Retry', async () => {
    renderScreens(PATH, {
      routes: {
        [IMPORT]: json(
          state({ state: 'failed', message: 'The backup folder is not writable.' }),
        ),
      },
    });

    const banner = await screen.findByRole('region', { name: 'Memory migration' });

    expect(
      within(banner).getByText('Memory could not be moved to the database'),
    ).toBeInTheDocument();

    expect(
      within(banner).getByText('The backup folder is not writable.'),
    ).toBeInTheDocument();

    expect(within(banner).getByRole('button', { name: 'Retry import' })).toBeEnabled();
  });

  it('explains that an import is already running instead of calling it a failure', async () => {
    const user = userEvent.setup();
    renderScreens(PATH, {
      routes: {
        [IMPORT]: json(attention),
        [RETRY]: refusal(409, 'memory_import_running', 'running'),
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Retry import' }));

    expect(await screen.findByText(/An import is already running/)).toBeInTheDocument();
  });

  it('holds Retry while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderScreens(PATH, { routes: { [IMPORT]: json(attention) } });

    expect(await screen.findByRole('button', { name: 'Retry import' })).toBeDisabled();
  });

  it('says when the status itself cannot be read, with Try again', async () => {
    const user = userEvent.setup();
    renderScreens(PATH, { routes: { [IMPORT]: networkDown } });

    expect(
      await screen.findByText(/Could not read the memory migration status/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
  });
});
