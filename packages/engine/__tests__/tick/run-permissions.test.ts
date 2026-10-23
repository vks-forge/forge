/**
 * Pins that a Worker run starts with the harness's "Bypass permissions" switch.
 *
 * Why: the owner turns Bypass permissions on or off per harness (d-0183). If the request the
 *   harness starts with ignored the stored switch, a Worker would stop for approvals the owner turned
 *   off, or run unattended after the owner asked to be asked. The default is on, so a harness never
 *   saved in Settings must still start in bypass.
 *
 * Pins: default run request carries permissions 'bypass'; a harness row with bypass_permissions
 *   false gives 'ask'; an explicit true gives 'bypass'.
 * Depends on: helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import { makeRig } from '#tests/helpers/rig.js';

async function startedPermissions(bypass?: boolean): Promise<string | undefined> {
  const rig = await makeRig();
  if (bypass !== undefined) {
    await rig.storage.transaction((tx) =>
      tx.harnesses.upsert({
        id: 'scripted',
        kind: 'claude',
        auth_mode: 'login',
        status: 'ok',
        bypass_permissions: bypass,
      }),
    );
  }

  await rig.request('Fix the doctor check');
  await rig.tick();

  return rig.driver.starts[0]?.permissions;
}

describe('run request permissions', () => {
  it('starts in bypass when the harness has no stored switch', async () => {
    expect(await startedPermissions()).toBe('bypass');
  });

  it('asks when the harness has Bypass permissions off', async () => {
    expect(await startedPermissions(false)).toBe('ask');
  });

  it('starts in bypass when the harness has it explicitly on', async () => {
    expect(await startedPermissions(true)).toBe('bypass');
  });
});
