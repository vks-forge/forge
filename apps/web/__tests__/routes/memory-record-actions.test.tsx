/**
 * Pins: what the memory record page can do: answer a pending proposal with the records it may
 * conflict with named, offer no way to edit, delete or revert, Export markdown (success with a
 * copyable path, refusal in words), say links and history are unknown while a project is on files,
 * say a record is missing or failed to load, and be reachable by keyboard.
 *
 * Why: this page is where the owner decides whether to trust a record. If it hid who wrote a
 * record, injected a record's text as markup, offered an edit on an append-only record or showed
 * an empty "Related" for a project that simply has no history yet, the owner would be misled. Run
 * over the stubbed Forge server in the real reply shapes.
 * Depends on: routes/memory/record-page, the stubbed Forge server, renderScreens.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import {
  needsAttention,
  rec,
  view,
} from '#tests/helpers/forge-data/memory-record-views.js';
import { renderScreens } from '#tests/helpers/render-screens.js';

const BASE = '/p/sample-service/memory';
const IMPORT = 'GET /projects/:slug/memory/import';

afterEach(() => vi.restoreAllMocks());

describe('memory record page: actions and states', () => {
  it('answers a pending proposal from here and names what it may conflict with', async () => {
    const user = userEvent.setup();
    renderScreens(`${BASE}/x-0001`, {
      routes: {
        [rec('x-0001')]: json({
          record: view({
            id: 'x-0001',
            kind: 'proposal',
            status: 'pending',
            approved_at: undefined,
            approved_by: undefined,
            possible_conflicts: [{ id: 'd-0002', line: 'Use pnpm workspaces' }],
          }),
        }),
        'POST /projects/:slug/memory/proposals/:id/approve': json({
          record: null,
          commit: '4',
        }),
      },
    });

    expect(await screen.findByText('May conflict with')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'd-0002' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Reject this proposal?',
    });

    expect(
      within(dialog).getByRole('button', { name: 'Reject proposal' }),
    ).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Approve proposal',
      }),
    );

    expect(await screen.findByText(/x-0001 approved/)).toBeInTheDocument();
  });

  it('offers no way to edit, delete or revert a record', async () => {
    renderScreens(`${BASE}/d-0001`);
    await screen.findByRole('heading', { level: 1 });

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('searchbox')).toHaveLength(0);
    expect(
      screen.queryAllByRole('button', { name: /edit|delete|remove|revert|save|undo/i }),
    ).toHaveLength(0);

    expect(
      screen.getByText(/never edited or deleted. To change one, supersede it/),
    ).toBeInTheDocument();
  });

  it('exports markdown and offers the path to copy', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const { forge } = renderScreens(`${BASE}/d-0001`);

    await user.click(await screen.findByRole('button', { name: 'Export markdown' }));

    expect(await screen.findByText(/Exported 141 files as markdown/)).toBeInTheDocument();
    expect(forge.stub.callsTo('POST /projects/:slug/memory/export')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Copy path' }));

    expect(writeText).toHaveBeenCalledWith(
      'C:/forge-data/exports/memory-sample-service-20261018T101500000Z',
    );
  });

  it('explains a refused export in words', async () => {
    const user = userEvent.setup();
    renderScreens(`${BASE}/d-0001`, {
      routes: {
        'POST /projects/:slug/memory/export': refusal(409, 'memory_not_migrated', 'x'),
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Export markdown' }));

    expect(await screen.findByText('Export failed')).toBeInTheDocument();
    expect(
      screen.getByText(/once the project’s memory is stored in Forge’s database/),
    ).toBeInTheDocument();
  });

  it('says links, history and related records are unknown while the project is on files', async () => {
    renderScreens(`${BASE}/d-0001`, { routes: { [IMPORT]: needsAttention } });

    await screen.findByRole('heading', { level: 1 });

    expect(
      await screen.findAllByText(/Not available until this project’s memory is stored/),
    ).toHaveLength(3);

    expect(screen.getByRole('button', { name: 'Export markdown' })).toBeDisabled();
    expect(screen.getByText(/Export is available once/)).toBeInTheDocument();
    expect(screen.queryByText('Nothing related yet.')).not.toBeInTheDocument();
  });

  it('says a record is missing, and reports a failed load with Try again', async () => {
    const missing = renderScreens(`${BASE}/d-9999`);

    expect(await screen.findByText('No record d-9999')).toBeInTheDocument();
    missing.unmount();

    const user = userEvent.setup();
    let calls = 0;
    renderScreens(`${BASE}/d-0001`, {
      routes: {
        [rec('d-0001')]: () => {
          calls += 1;

          return calls === 1
            ? { status: 500, body: { error: { code: 'boom', message: 'read failed' } } }
            : json({ record: view({ id: 'd-0001' }) });
        },
      },
    });

    expect(await screen.findByText('read failed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('is reachable by keyboard: back link, export, then the record links', async () => {
    const user = userEvent.setup();
    renderScreens(`${BASE}/d-0006`);
    await screen.findByRole('heading', { level: 1 });

    await user.tab();
    expect(screen.getByRole('link', { name: 'Memory' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Export markdown' })).toHaveFocus();
    await user.tab();
    expect(await screen.findByRole('link', { name: /Open d-0001/ })).toHaveFocus();
  });
});
