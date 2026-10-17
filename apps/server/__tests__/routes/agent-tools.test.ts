/**
 * The agent helper routes: the template gallery and the harness pickers.
 *
 * Why: the editor needs the gallery to start from a template, and the harnesses and models an agent
 *   can run on, with why one cannot (paused for quota, signed out, failed its compatibility check)
 *   and where to fix it, so the owner learns when picking and not when a ticket parks. The models
 *   come from the compatibility report of the installed build, else from what the driver declares.
 *
 * Pins: GET /agents/templates (six, with real instructions); GET /agents/runs-on (models,
 *   readiness, sign-in state, quota pause, report models first).
 * Depends on: helpers/agent-rig. IO: a loopback socket.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

let rig: AgentRig | undefined;

const start = async (
  opts: Parameters<typeof startAgentRig>[0] = {},
): Promise<AgentRig> => {
  rig = await startAgentRig(opts);

  return rig;
};

const call = (r: AgentRig, method: string, path: string, body?: unknown) =>
  r.http.json(method, path, body);

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

describe('GET /agents/templates', () => {
  it('lists the six gallery templates with real instructions', async () => {
    const r = await start();
    const res = await call(r, 'GET', '/agents/templates');
    const templates = (
      res.body as { templates: { id: string; definition: { instructions: string } }[] }
    ).templates;

    expect(res.status).toBe(200);
    expect(templates).toHaveLength(6);
    expect(templates.every((t) => t.definition.instructions.length > 500)).toBe(true);
  });
});

describe('GET /agents/runs-on', () => {
  it('lists every configured harness with its models and readiness', async () => {
    const r = await start();
    const res = await call(r, 'GET', '/agents/runs-on');
    const [h] = (
      res.body as {
        harnesses: { id: string; ready: boolean; models: { id: string }[] }[];
      }
    ).harnesses;

    expect(res.status).toBe(200);
    expect(h).toMatchObject({ id: 'claude-code', ready: true });
    expect(h?.models.map((m) => m.id)).toEqual(['sonnet']);
  });

  it('lists the models stored with the compatibility report of the installed build, and the sign-in state', async () => {
    const r = await start();
    await r.storage.transaction(async (tx) => {
      await tx.harnesses.upsert({
        id: 'claude',
        kind: 'claude',
        version: '2.1.299',
        auth_mode: 'login',
        status: 'ok',
      });

      await tx.harnessVersions.upsert({
        kind: 'claude',
        version: '2.1.299',
        compat: 'pass',
        checked_at: '2026-10-17T10:00:00.000Z',
        report: {
          kind: 'claude',
          version: '2.1.299',
          started_at: '2026-10-17T09:59:00.000Z',
          finished_at: '2026-10-17T10:00:00.000Z',
          passed: true,
          summary: 'ok',
          checks: [],
          tools: [],
          models: [
            {
              id: 'opus',
              label: 'Opus',
              speed: 'deep',
              cost: 'high',
              recommended_for: ['reviewer'],
            },
          ],
        },
      });
    });

    const res = await call(r, 'GET', '/agents/runs-on');
    const [h] = (
      res.body as {
        harnesses: {
          signed_in: boolean;
          compat: string;
          version: string;
          models: { id: string }[];
          models_checked_at: string;
        }[];
      }
    ).harnesses;

    expect(h).toMatchObject({
      signed_in: true,
      compat: 'pass',
      version: '2.1.299',
      models_checked_at: '2026-10-17T10:00:00.000Z',
    });

    expect(h?.models.map((m) => m.id)).toEqual(['opus']);
  });

  it('shows a harness parked for quota as not ready with the reason and the time', async () => {
    const r = await start();
    await r.storage.transaction((tx) =>
      tx.harnessState.upsert({
        harness_id: 'claude-code',
        paused_until: '2026-10-17T14:30:00.000Z',
        reason: 'Out of quota',
        updated_at: '2026-10-17T11:00:00.000Z',
      }),
    );

    const res = await call(r, 'GET', '/agents/runs-on');
    const [h] = (
      res.body as {
        harnesses: {
          ready: boolean;
          reasons: string[];
          paused_until?: string;
          fix_href: string;
        }[];
      }
    ).harnesses;

    expect(h?.ready).toBe(false);
    expect(h?.paused_until).toBe('2026-10-17T14:30:00.000Z');
    expect(h?.reasons[0]).toContain('14:30 UTC');
    expect(h?.fix_href).toMatch(/^\/settings\/harnesses\//);
  });
});
