/**
 * A failed compatibility check pauses the harness; a re-run reconciles tool shapes.
 *
 * Why: a build that breaks the safety facts (hooks, permission requests, id join) must stop
 * Workers from starting on it, with a message the owner can act on, and only a later passing
 * check may lift that. On a re-run, an approved tool whose shape did not change must stay
 * approved (no re-approval chore) and one whose shape changed must go back to pending, which
 * is how a hand-edited or upgraded tool schema is caught (d-0088).
 *
 * Pins: a failure is confirmed once before it counts, pause with plain note and run setup carrying it, unpause on pass, owner binary and
 *   login kept on the paused row, unchanged approved kept and changed set pending, one check
 *   in flight at a time, a check that cannot run pauses nothing.
 * Depends on: src/services/harness-compat, harness-source, helpers/compat-rig. No IO.
 */

import type { CompatReport } from '@forge/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { readHarnessSetup } from '#/services/harness-source.js';
import { compatReport, hash, makeCompatRig } from '#tests/helpers/compat-rig.js';
import type { CompatRig } from '#tests/helpers/compat-rig.js';

let rig: CompatRig;

beforeEach(() => {
  rig = makeCompatRig();
});

const failing = (v: string): CompatReport =>
  compatReport(v, {
    passed: false,
    summary: `Build ${v} failed 1 of 6 compatibility checks (hooks_before_first_tool: x).`,
  });

const harnessRow = () => rig.storage.transaction((tx) => tx.harnesses.get('claude'));

describe('a failed check', () => {
  it('pauses the harness with the plain message, and the run setup carries it', async () => {
    rig.outcome = failing;
    const compat = rig.service();
    await compat.observe('claude');
    await compat.idle();

    const setup = await readHarnessSetup(rig.storage, 'claude');

    expect(await harnessRow()).toMatchObject({
      status: 'paused',
      status_note: expect.stringContaining('failed'),
    });

    expect(setup.pausedReason).toContain('failed 1 of 6');
    expect((await compat.view('claude')).compat).toBe('fail');
  });

  it('is confirmed by a second run before the pause, so one slow run does not pause it', async () => {
    let n = 0;
    rig.outcome = (v) => (n++ === 0 ? failing(v) : compatReport(v));
    const compat = rig.service();
    await compat.observe('claude');
    await compat.idle();

    expect(rig.checks).toBe(2);
    expect(await harnessRow()).toBeNull();
    expect((await compat.view('claude')).compat).toBe('pass');
  });

  it('is lifted by a later passing check', async () => {
    rig.outcome = failing;
    const compat = rig.service();
    await compat.observe('claude');
    await compat.idle();

    rig.outcome = (v) => compatReport(v);
    await compat.start('claude');
    await compat.idle();

    const harness = await harnessRow();

    expect(harness?.status).toBe('unknown');
    expect(harness?.status_note).toBeUndefined();
    expect((await readHarnessSetup(rig.storage, 'claude')).pausedReason).toBeUndefined();
  });

  it('keeps the owner binary and login on the harness row it pauses', async () => {
    await rig.storage.transaction((tx) =>
      tx.harnesses.upsert({
        id: 'claude',
        kind: 'claude',
        binary_path: 'C:/bin/claude.exe',
        auth_mode: 'api_key',
        status: 'ok',
      }),
    );

    rig.outcome = failing;
    const compat = rig.service();
    await compat.observe('claude');
    await compat.idle();

    expect(await harnessRow()).toMatchObject({
      binary_path: 'C:/bin/claude.exe',
      auth_mode: 'api_key',
      status: 'paused',
    });
  });
});

describe('a re-run', () => {
  it('keeps an approved tool whose shape is unchanged and sets a changed one pending', async () => {
    const compat = rig.service();
    await compat.observe('claude');
    await compat.idle();
    for (const tool of ['read', 'edit']) {
      await compat.decide('claude', tool, 'approved', { author: 'owner', reason: 'ok' });
    }

    rig.outcome = (v) =>
      compatReport(v, {}, [
        { tool: 'read', native: ['Read'], schema_hash: hash('a') },
        { tool: 'edit', native: ['Edit'], schema_hash: hash('e') },
      ]);

    await compat.start('claude');
    await compat.idle();

    const after = await rig.rows('9.9.9');

    expect(after.find((t) => t.tool === 'read')).toMatchObject({ status: 'approved' });
    expect(after.find((t) => t.tool === 'edit')).toMatchObject({
      status: 'pending',
      schema_hash: hash('e'),
    });

    expect(after.find((t) => t.tool === 'edit')?.decided_by).toBeUndefined();
  });

  it('returns the running check instead of starting a second', async () => {
    const compat = rig.service();
    const first = await compat.start('claude');
    const second = await compat.start('claude');
    await compat.idle();

    expect(first.state).toBe('running');
    expect(second.state).toBe('running');
    expect(rig.checks).toBe(1);
  });
});

describe('a check that cannot run', () => {
  it('is reported as failed with the reason and pauses nothing', async () => {
    rig.outcome = () => new Error('claude did not report a version');
    const compat = rig.service();
    await compat.observe('claude');
    await compat.idle();

    const view = await compat.view('claude');

    expect(view.job).toMatchObject({
      state: 'failed',
      error: 'claude did not report a version',
    });

    expect(view.compat).toBe('pending');
    expect(await harnessRow()).toBeNull();
  });
});
