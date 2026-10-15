/**
 * System API: what the UI reads to decide whether to show the first-run wizard.
 *
 * Why: a fresh install must land on setup and a set-up one must never see it again, with no
 *   flag to keep in step. The answer is derived from what exists (registered projects, a
 *   harness that passed its test), names the data folder for the wizard's first step, and
 *   must never carry a token or secret.
 *
 * Pins: an empty Forge is not complete and has no OK harness; a registered project (even one
 *   archived later) makes it complete; a harness with status ok is reported; the answer shows
 *   the data home and a version, nothing that looks like the install token; the route needs the token.
 * Depends on: helpers/projects-rig, helpers/install-token, src/routes. IO: in-memory storage.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { TEST_INSTALL_TOKEN } from '#tests/helpers/install-token.js';
import { startProjectsRig } from '#tests/helpers/projects-rig.js';
import type { ProjectsRig } from '#tests/helpers/projects-rig.js';

let rigs: ProjectsRig | undefined;

afterEach(async () => {
  await rigs?.rig.close();
  rigs = undefined;
});

const start = async (): Promise<ProjectsRig> => {
  rigs = await startProjectsRig('/forge-data/worktrees');

  return rigs;
};

describe('GET /system', () => {
  it('says setup is not finished on an empty Forge and names the data folder', async () => {
    const { rig } = await start();
    const res = await rig.json('GET', '/system');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      service: 'forge',
      data_home: expect.stringContaining('forge-data'),
      first_run: { complete: false, project_count: 0, harness_ok: false },
    });

    expect((res.body as { version: string }).version.length).toBeGreaterThan(0);
  });

  it('is complete once a project exists, even an archived one', async () => {
    const { rig, storage } = await start();
    await storage.transaction((tx) =>
      tx.projects.upsert({
        id: 'a',
        slug: 'a',
        prefix: 'A',
        status: 'archived',
        ecosystems: [],
        harness_defaults: {},
        tier_c_globs: [],
      }),
    );

    expect((await rig.json('GET', '/system')).body).toMatchObject({
      first_run: { complete: true, project_count: 1 },
    });
  });

  it('reports a harness whose last test passed', async () => {
    const { rig, storage } = await start();
    await storage.transaction((tx) =>
      tx.harnesses.upsert({
        id: 'claude',
        kind: 'claude',
        auth_mode: 'login',
        status: 'ok',
      }),
    );

    expect((await rig.json('GET', '/system')).body).toMatchObject({
      first_run: { harness_ok: true },
    });
  });

  it('never carries the install token, and needs it', async () => {
    const { rig } = await start();
    const res = await rig.json('GET', '/system');

    expect(JSON.stringify(res.body)).not.toContain(TEST_INSTALL_TOKEN);

    const bare = await rig.json('GET', '/system', undefined, { authorization: '' });
    expect([401, 403]).toContain(bare.status);
  });
});
