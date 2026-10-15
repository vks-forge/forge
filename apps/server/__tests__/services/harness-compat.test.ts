/**
 * The harness compatibility service: first sight of a build and tool approvals.
 *
 * Why: when the owner upgrades Claude Code, Forge must neither trust the new build blindly
 * nor make the owner wait. A shipped (verified) build is recorded at once with its tools
 * approved; any other build is checked in the background and leaves every new tool shape
 * pending until approved. These are the guarantees that make "unknown build, unknown tool:
 * deny" true end to end (d-0088); the real check is replaced by a scripted one here.
 *
 * Pins: known-good build recorded with `forge-release` approvals and no check (ACP only),
 *   unknown build checked once, pass leaves tools pending, approve/deny record who and why,
 *   deciding an unknown tool is null, no port means no build known.
 * Depends on: src/services/harness-compat, helpers/compat-rig. No IO.
 */

import { KNOWN_GOOD_BUILDS } from '@forge/drivers';
import { beforeEach, describe, expect, it } from 'vitest';
import { hash, makeCompatRig } from '#tests/helpers/compat-rig.js';
import type { CompatRig } from '#tests/helpers/compat-rig.js';

const GOOD = KNOWN_GOOD_BUILDS[0]?.version ?? '';
const NEW_BUILD = '9.9.9';

let rig: CompatRig;

beforeEach(() => {
  rig = makeCompatRig();
});

describe('a build shipped as verified', () => {
  it('is recorded as compatible with its tools approved by the release, without a check', async () => {
    rig.installed = GOOD;
    const compat = rig.service();

    await compat.observe('claude');
    await compat.idle();

    const view = await compat.view('claude');
    const tools = await rig.rows(GOOD);

    expect(rig.checks).toBe(0);
    expect(view).toMatchObject({ version: GOOD, compat: 'pass', job: { state: 'idle' } });
    expect(tools.length).toBeGreaterThanOrEqual(6);
    expect(
      tools.every((t) => t.status === 'approved' && t.decided_by === 'forge-release'),
    ).toBe(true);
  });

  it('keeps an owner decision made on the build earlier', async () => {
    rig.installed = GOOD;
    await rig.storage.transaction((tx) =>
      tx.harnessToolSchemas.upsert({
        harness_kind: 'claude',
        version: GOOD,
        tool: 'read',
        schema_hash: hash('c'),
        status: 'denied',
        decided_by: 'owner',
      }),
    );

    await rig.service().observe('claude');

    const read = (await rig.rows(GOOD)).find((t) => t.tool === 'read');

    expect(read).toMatchObject({ status: 'denied', decided_by: 'owner' });
  });

  it('is not trusted on the CLI engine, whose tool list differs: it is checked instead', async () => {
    rig.installed = GOOD;
    rig.engine = 'cli';
    const compat = rig.service();

    await compat.observe('claude');
    await compat.idle();

    expect(rig.checks).toBe(1);
  });
});

describe('an unknown build', () => {
  it('is checked once in the background and its tools wait for approval', async () => {
    const compat = rig.service();

    await compat.observe('claude');
    await compat.observe('claude');
    await compat.idle();

    const view = await compat.view('claude');

    expect(rig.checks).toBe(1);
    expect(view).toMatchObject({
      version: NEW_BUILD,
      compat: 'pass',
      job: { state: 'done' },
    });

    expect((await rig.rows(NEW_BUILD)).map((t) => [t.tool, t.status])).toEqual([
      ['read', 'pending'],
      ['edit', 'pending'],
    ]);
  });

  it('is approved tool by tool, with who and why recorded', async () => {
    const compat = rig.service();
    await compat.observe('claude');
    await compat.idle();

    const approved = await compat.decide('claude', 'read', 'approved', {
      author: 'owner',
      reason: 'same as before',
    });

    const denied = await compat.decide('claude', 'edit', 'denied', {
      author: 'owner',
      reason: 'new argument',
    });

    expect(approved).toMatchObject({
      status: 'approved',
      decided_by: 'owner',
      decision_reason: 'same as before',
      decided_at: '2026-10-14T12:00:00.000Z',
    });

    expect(denied).toMatchObject({ status: 'denied' });
    expect((await compat.tools('claude')).tools.map((t) => t.status)).toEqual([
      'approved',
      'denied',
    ]);
  });

  it('answers null when deciding a tool the build never offered, or before any build is known', async () => {
    const compat = rig.service();
    const by = { author: 'a', reason: 'r' };

    expect(await compat.decide('claude', 'read', 'approved', by)).toBe(null);

    await compat.observe('claude');
    await compat.idle();

    expect(await compat.decide('claude', 'nope', 'approved', by)).toBe(null);
  });
});

describe('without a harness check', () => {
  it('knows no build and records nothing', async () => {
    const compat = rig.service(false);

    expect(await compat.observe('claude')).toBeNull();
    expect(compat.installedVersion('claude')).toBeNull();
    expect(await compat.view('claude')).toMatchObject({
      version: null,
      compat: 'unknown',
    });

    expect((await compat.start('claude')).state).toBe('idle');
  });
});
