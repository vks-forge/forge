/**
 * Harness build guard: a run does not start on a build whose approvals were never loaded.
 *
 * Why: Forge reads the installed `claude` build at boot and when Settings change, and judges
 *   every Worker tool call by the approvals recorded for that build. If the owner upgrades
 *   `claude` in place while Forge keeps running, a Worker started afterwards would run the
 *   new build under the old build's approvals. The check before each start must notice the
 *   change, start the first-sight check of the new build, and refuse that start so the
 *   ticket parks until the owner has seen the new build.
 *
 * Pins: an unchanged build with every tool decided passes and returns its version; an
 *   unchanged build with a pending tool, or whose check is still running, is refused with
 *   HarnessToolsPendingError before any run exists; deciding the tools lifts the refusal; a
 *   changed build throws
 *   HarnessChangedError naming both builds and starts the check of the new one; once the
 *   new build is the loaded one the next start passes; an unreadable build is not a change;
 *   with no port nothing is guarded.
 * Depends on: src/services/harness-compat, helpers/compat-rig. No IO.
 */

import { HarnessChangedError, HarnessToolsPendingError } from '@forge/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCompatRig } from '#tests/helpers/compat-rig.js';
import type { CompatRig } from '#tests/helpers/compat-rig.js';

let rig: CompatRig;

/** The owner approving every tool of the build in Settings. */
async function approveAll(version: string): Promise<void> {
  await rig.storage.transaction(async (tx) => {
    for (const row of await tx.harnessToolSchemas.list('claude', version)) {
      await tx.harnessToolSchemas.upsert({
        ...row,
        status: 'approved',
        decided_by: 'owner',
      });
    }
  });
}

beforeEach(() => {
  rig = makeCompatRig();
});

describe('assertCurrent', () => {
  it('passes and returns the build when it is the one that was loaded', async () => {
    rig.installed = '9.9.9';
    const compat = rig.service();
    await compat.observe('claude');
    await compat.idle();
    await approveAll('9.9.9');

    expect(await compat.assertCurrent('claude')).toBe('9.9.9');
  });

  it('refuses the start while a tool of the build is pending, and passes once approved', async () => {
    rig.installed = '9.9.9';
    const compat = rig.service();
    await compat.observe('claude');
    await compat.idle();

    const refused = await compat.assertCurrent('claude').catch((e: unknown) => e);

    expect(refused).toBeInstanceOf(HarnessToolsPendingError);
    expect(refused).toMatchObject({ installed: '9.9.9', tools: ['read', 'edit'] });

    await approveAll('9.9.9');

    expect(await compat.assertCurrent('claude')).toBe('9.9.9');
  });

  it('refuses the start while the check of the build is still running', async () => {
    rig.installed = '9.9.9';
    const compat = rig.service();
    await compat.observe('claude');

    await expect(compat.assertCurrent('claude')).rejects.toBeInstanceOf(
      HarnessToolsPendingError,
    );

    await compat.idle();
  });

  it('does not refuse a build whose tools carried over approved from the one before', async () => {
    rig.installed = '9.9.9';
    const compat = rig.service();
    await compat.observe('claude');
    await compat.idle();
    await approveAll('9.9.9');

    rig.installed = '10.0.0';
    await compat.assertCurrent('claude').catch(() => undefined);
    await compat.idle();

    expect((await rig.rows('10.0.0')).every((r) => r.status === 'approved')).toBe(true);
    expect(await compat.assertCurrent('claude')).toBe('10.0.0');
  });

  it('refuses the start after an in-place upgrade and checks the new build', async () => {
    rig.installed = '9.9.9';
    const compat = rig.service();
    await compat.observe('claude');
    await compat.idle();
    const before = rig.checks;

    rig.installed = '10.0.0';
    const refused = await compat.assertCurrent('claude').catch((e: unknown) => e);
    await compat.idle();

    expect(refused).toBeInstanceOf(HarnessChangedError);
    expect((refused as HarnessChangedError).message).toMatch(/^harness_changed:/);
    expect(refused).toMatchObject({ loaded: '9.9.9', installed: '10.0.0' });
    expect(rig.checks).toBe(before + 1);
    expect(compat.installedVersion('claude')).toBe('10.0.0');
    expect((await rig.rows('10.0.0')).length).toBeGreaterThan(0);
  });

  it('lets the next start through once the new build is the loaded one', async () => {
    rig.installed = '9.9.9';
    const compat = rig.service();
    await compat.observe('claude');
    rig.installed = '10.0.0';
    await compat.assertCurrent('claude').catch(() => undefined);
    await compat.idle();
    await approveAll('10.0.0');

    expect(await compat.assertCurrent('claude')).toBe('10.0.0');
  });

  it('does not treat an unreadable build as a change', async () => {
    rig.installed = '9.9.9';
    const compat = rig.service();
    await compat.observe('claude');
    await compat.idle();
    await approveAll('9.9.9');
    rig.installed = null;

    expect(await compat.assertCurrent('claude')).toBe('9.9.9');
  });

  it('guards nothing without a port', async () => {
    expect(await rig.service(false).assertCurrent('claude')).toBeNull();
  });
});
