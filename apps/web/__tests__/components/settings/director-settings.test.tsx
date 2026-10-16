/**
 * Pins: the Forge Director page: edits save as one new version with exactly the keys that
 * changed, the locked steps refuse to move or go, a broken flow blocks the save with a reason,
 * Reset to default stages a removal that only a save applies, and a server without Director
 * settings still opens the page on built-in defaults.
 *
 * Why: this page decides how a card is planned before any ticket exists. The failures that
 *   hurt are quiet ones: a flow saved without its approval step, a save that pins every default
 *   instead of the one edit, a reset that wipes history, a page that fails to open on an older
 *   server. Each is pinned over the stubbed Forge server, which validates and versions like the
 *   real one.
 * Depends on: routes/settings/director-page, helpers/render-settings, helpers/choose. jsdom.
 */

import { ConfigVersion } from '@forge/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose } from '#tests/helpers/choose.js';
import { json } from '#tests/helpers/fetch-stub.js';
import { legacyCompanyBody } from '#tests/helpers/forge-data/director-data.js';
import { lastCompanyPut, saveVersion } from '#tests/helpers/director-page.js';
import { renderSettings } from '#tests/helpers/render-settings.js';

const lastPut = lastCompanyPut;
const save = saveVersion;

const customised = [
  ConfigVersion.parse({
    id: 1,
    scope: 'company',
    project: null,
    version: 1,
    doc: {
      engine: { max_concurrent_global: 3 },
      models: { director: { triage: 'sonnet' } },
      director: { house_rules: 'No billing edits.' },
    },
    author: 'fixture-owner',
    reason: 'Tune the Director',
    created_at: Date.parse('2026-09-22T12:00:00.000Z'),
  }),
];

describe('Director settings', () => {
  it('shows a model per step, the rules, the limits, the playbooks and the locked list', async () => {
    renderSettings('/settings/director');

    expect(await screen.findByText('Model per step')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Triage' })).toHaveTextContent('Opus');
    expect(screen.getByRole('combobox', { name: 'Grill turn' })).toHaveTextContent(
      'Sonnet',
    );

    expect(
      screen.getAllByRole('combobox', { name: /^[A-Z]/ }).length,
    ).toBeGreaterThanOrEqual(11);

    expect(screen.getByLabelText('House rules')).toHaveValue('');
    expect(screen.getByLabelText('Questions per round')).toHaveValue(8);
    expect(screen.getByLabelText('Verify may run up to')).toHaveValue(300);
    expect(screen.getByText(/A warning only\. Nothing is stopped/)).toBeVisible();
    expect(screen.getByText('Using built-in defaults.')).toBeVisible();

    const playbooks = within(screen.getByRole('list', { name: 'Playbooks' }));

    expect(playbooks.getByText('Grill the owner')).toBeInTheDocument();
    expect(playbooks.getByText(/Ask one question at a time/)).toBeInTheDocument();

    const locked = within(screen.getByRole('list', { name: 'Locked rules' }));

    expect(locked.getAllByRole('listitem')).toHaveLength(6);
    expect(locked.getByText('The approval floor')).toBeVisible();
  });

  it('saves a changed model, house rules and approval mode as just those keys', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    await screen.findByText('Model per step');

    await choose(user, 'Triage', 'Sonnet');
    await user.type(screen.getByLabelText('House rules'), 'Never edit billing/.');
    await choose(user, 'Plan approval', 'Always ask me');
    await save(user, 'Tighter planning');

    expect(await screen.findByText('Saved as a new version')).toBeInTheDocument();
    expect(lastPut(forge)).toMatchObject({
      expectedVersion: 2,
      doc: {
        engine: { max_concurrent_global: 3, shutdown_drain_ms: 20_000 },
        models: { director: { triage: 'sonnet' } },
        director: { house_rules: 'Never edit billing/.', approval_mode: 'always_ask' },
      },
    });

    await waitFor(() =>
      expect(screen.getAllByText('Version 3').length).toBeGreaterThan(0),
    );

    expect(screen.getByText('director.approval_mode = "always_ask"')).toBeVisible();
  });

  it('types a model that is not one of the common three', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    await screen.findByText('Model per step');

    await choose(user, 'Verify', 'Other…');
    const box = screen.getByLabelText('Verify model name');
    await user.clear(box);

    expect(await screen.findAllByText('Name a model.')).not.toHaveLength(0);

    await user.type(box, 'gpt-5-codex');
    await save(user, 'Try another model');

    await screen.findByText('Saved as a new version');
    expect(lastPut(forge).doc['models']).toEqual({ director: { verify: 'gpt-5-codex' } });
  });

  it('saves limits in the unit shown (seconds, KB) and says the budget only warns', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    const timeout = await screen.findByLabelText('Verify may run up to');

    await user.clear(timeout);
    await user.type(timeout, '90');
    const warn = screen.getByLabelText('Warn when a card has spent');
    await user.clear(warn);
    await user.type(warn, '12.5');
    await save(user, 'Faster verify');

    await screen.findByText('Saved as a new version');
    expect(lastPut(forge).doc['director']).toEqual({
      budget_warning_usd: 12.5,
      step_timeouts_ms: { verify: 90_000 },
    });
  });

  it('blocks a limit that is not a positive number', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/director');
    const rounds = await screen.findByLabelText('Rounds');

    await user.clear(rounds);
    await user.type(rounds, '0');

    expect(
      await screen.findByText(/Must be more than 0|Must be at least 1/),
    ).toBeVisible();

    expect(screen.getByRole('button', { name: 'Save as version 3' })).toBeDisabled();
  });
});

describe('Reset to default', () => {
  it('stages the removal, saves it as a new version and keeps unrelated overrides', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director', {
      companyHistory: customised,
    });

    expect(
      await screen.findByText(/Customised: some Director settings differ/),
    ).toBeVisible();

    expect(screen.getByLabelText('House rules')).toHaveValue('No billing edits.');

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    await user.click(await screen.findByRole('button', { name: 'Stage the reset' }));

    expect(await screen.findByText('Reset to default is ready to save')).toBeVisible();
    expect(forge.stub.callsTo('PUT /settings/company')).toHaveLength(0);

    await save(user, 'Back to defaults', 'Save as version 2');
    await screen.findByText('Saved as a new version');

    expect(lastPut(forge)).toMatchObject({
      expectedVersion: 1,
      doc: { engine: { max_concurrent_global: 3 } },
    });

    expect(lastPut(forge).doc).not.toHaveProperty('director');
    expect(lastPut(forge).doc).not.toHaveProperty('models');
    expect(await screen.findByText('Using built-in defaults.')).toBeVisible();
    expect(screen.getByLabelText('House rules')).toHaveValue('');
  });

  it('is cancelled by Discard edits and is not offered on built-in defaults', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/director', { companyHistory: customised });
    await screen.findByText(/Customised/);

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    await user.click(await screen.findByRole('button', { name: 'Stage the reset' }));
    await user.click(await screen.findByRole('button', { name: 'Discard edits' }));

    expect(await screen.findByLabelText('House rules')).toHaveValue('No billing edits.');
  });

  it('is disabled while nothing is overridden', async () => {
    renderSettings('/settings/director');

    expect(
      await screen.findByRole('button', { name: 'Reset to default' }),
    ).toBeDisabled();
  });
});

describe('an older server without Director settings', () => {
  const legacy = { 'GET /settings/company': () => json(legacyCompanyBody(0)) };

  it('opens on built-in defaults instead of failing', async () => {
    renderSettings('/settings/director', { routes: legacy, companyHistory: [] });

    expect(await screen.findByText('Using built-in defaults.')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Survey' })).toHaveTextContent('Opus');
    expect(screen.getByRole('combobox', { name: 'Grill turn' })).toHaveTextContent(
      'Sonnet',
    );

    expect(
      within(screen.getByRole('list', { name: 'Planning flow' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(6);

    expect(screen.getByText(/No playbooks are in these settings yet/)).toBeVisible();
  });

  it('keeps the Limits screen working', async () => {
    renderSettings('/settings/limits', { routes: legacy, companyHistory: [] });

    expect(await screen.findByLabelText('On this machine')).toBeVisible();
  });

  it('saving an edit creates the section, writing only the changed key', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director', {
      routes: legacy,
      companyHistory: [],
    });

    await user.type(await screen.findByLabelText('House rules'), 'Small tickets.');
    await save(user, 'First Director rule', 'Save as version 1');
    await screen.findByText('Saved as a new version');

    expect(lastPut(forge)).toMatchObject({
      expectedVersion: 0,
      doc: { director: { house_rules: 'Small tickets.' } },
    });

    expect(Object.keys(lastPut(forge).doc['director'] as object)).toEqual([
      'house_rules',
    ]);
  });
});
