/**
 * Pins: the company settings reply that now carries `agents`, `models.director.draft_agent` and
 * `director.step_timeouts_ms.draft_agent` is accepted, a company save never resends the roster,
 * and the Director page offers the models the harness reports.
 *
 * Why: agents arrived inside the company settings document. A web that rejected the new fields
 * would break Limits, General and every project screen at once; a Limits save that sent the whole
 * roster along would pin every built-in instruction and stop a better shipped one from reaching
 * anyone; and the Director's model rows must follow the harness's own list so a model the build
 * adds can be picked. Each is pinned over the stubbed Forge server.
 * Depends on: src/schemas/director-config, src/state/use-company-draft, src/components/director/model-fields,
 * helpers/render-settings.
 */

import { BUILTIN_AGENTS, ConfigVersion } from '@forge/core';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose } from '#tests/helpers/choose.js';
import { lastCompanyPut, saveVersion } from '#tests/helpers/director-page.js';
import { json } from '#tests/helpers/fetch-stub.js';
import { SAMPLE_HARNESS } from '#tests/helpers/forge-data/agent-data.js';
import { BUILTIN_FORGE_WITH_DIRECTOR } from '#tests/helpers/forge-data/director-data.js';
import { historyFixtures } from '#tests/helpers/forge-data/settings-data.js';
import { renderSettings } from '#tests/helpers/render-settings.js';

describe('company settings with agents', () => {
  it('accepts the roster, the draft_agent model and its timeout', async () => {
    const { api } = renderSettings('/settings/limits', {
      routes: {
        'GET /settings/company': json({
          config: { ...BUILTIN_FORGE_WITH_DIRECTOR, agents: BUILTIN_AGENTS },
          version: 2,
        }),
      },
    });

    const view = await api.settings.company();

    expect(Object.keys(view.config.agents)).toEqual([
      'implementer',
      'test-writer',
      'reviewer',
      'critic',
    ]);

    expect(view.config.models.director.draft_agent).toBeTruthy();
    expect(view.config.director.step_timeouts_ms.draft_agent).toBeGreaterThan(0);
  });

  it('reads an older server with no agents as an empty roster', async () => {
    const older: Record<string, unknown> = { ...BUILTIN_FORGE_WITH_DIRECTOR };
    delete older['agents'];
    const { api } = renderSettings('/settings/limits', {
      routes: { 'GET /settings/company': json({ config: older, version: 2 }) },
    });

    expect((await api.settings.company()).config.agents).toEqual({});
    expect(await screen.findByLabelText('Per project')).toBeVisible();
  });

  it('a Limits save never resends the roster, and keeps the agents already stored', async () => {
    const user = userEvent.setup();
    const stored = ConfigVersion.parse({
      ...historyFixtures()[1],
      id: 3,
      version: 3,
      doc: {
        engine: { max_concurrent_global: 3 },
        agents: { reviewer: { ...BUILTIN_AGENTS['reviewer'], instructions: 'Mine.' } },
      },
    });

    const { forge } = renderSettings('/settings/limits', {
      companyHistory: [...historyFixtures(), stored],
      routes: {
        'GET /settings/company': json({
          config: { ...BUILTIN_FORGE_WITH_DIRECTOR, agents: BUILTIN_AGENTS },
          version: 3,
        }),
      },
    });

    const field = await screen.findByLabelText('Per project');
    await user.clear(field);
    await user.type(field, '2');
    await saveVersion(user, 'Bigger machine', 'Save as version 4');

    const { doc, expectedVersion } = lastCompanyPut(forge);

    expect(expectedVersion).toBe(3);
    expect(doc['agents']).toEqual(stored.doc['agents']);
    expect(Object.keys(doc['agents'] as object)).toEqual(['reviewer']);
    expect(doc['engine']).toMatchObject({ max_concurrent_per_project: 2 });
  });
});

describe('Director models from the harness', () => {
  it('lists the models the harness reports and keeps Other…', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/director', {
      routes: {
        'GET /agents/runs-on': json({
          harnesses: [
            {
              ...SAMPLE_HARNESS,
              models: [
                ...SAMPLE_HARNESS.models,
                {
                  id: 'opus-5',
                  label: 'Opus 5',
                  speed: 'deep',
                  cost: 'high',
                  recommended_for: [],
                },
              ],
            },
          ],
        }),
      },
    });

    const picker = await screen.findByRole('combobox', { name: 'Draft an agent' });
    await user.click(picker);

    const rows = (await screen.findAllByRole('option')).map((o) => o.textContent);

    expect(rows.some((r) => r?.startsWith('Opus 5'))).toBe(true);
    expect(rows.some((r) => r?.startsWith('Other…'))).toBe(true);

    await user.click(screen.getByRole('option', { name: /Opus 5/ }));
    expect(within(picker).getByText('Opus 5')).toBeVisible();
  });

  it('falls back to Opus, Sonnet and Haiku when the harness list cannot be read', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/director', {
      routes: {
        'GET /agents/runs-on': {
          status: 500,
          body: { error: { code: 'x', message: 'x' } },
        },
      },
    });

    await choose(user, 'Draft an agent', 'Haiku');

    expect(screen.getByRole('combobox', { name: 'Draft an agent' })).toHaveTextContent(
      'Haiku',
    );
  });
});
