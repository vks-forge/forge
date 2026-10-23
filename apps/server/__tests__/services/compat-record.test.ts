/**
 * Storing a compatibility report across two builds of the same harness.
 *
 * Why: Claude Code updates itself often and most updates leave the built-in tools untouched.
 *   If every new build started with all tools pending, the owner would re-approve the same
 *   seven tools each time and a Worker started right after an update would be denied on
 *   every call. A tool whose shape the owner already decided keeps that decision, marked as
 *   carried so the audit trail says who really decided; a changed or new shape stays pending.
 *
 * Pins: recordReport() carries approved and denied decisions of the most recent decided
 *   build for an identical hash, leaves changed and new tools pending, carries nothing for a
 *   first build, and does not carry across harness kinds.
 * Depends on: src/services/compat-record, helpers/compat-rig. No IO.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { compatReport, hash, makeCompatRig } from '#tests/helpers/compat-rig.js';
import type { CompatRig } from '#tests/helpers/compat-rig.js';
import { recordReport } from '#/services/compat-record.js';

const tools = (read: string, edit: string, extra = false) => [
  { tool: 'read', native: ['Read'], schema_hash: hash(read) },
  { tool: 'edit', native: ['Edit'], schema_hash: hash(edit) },
  ...(extra ? [{ tool: 'grep', native: ['Grep'], schema_hash: hash('e') }] : []),
];

let rig: CompatRig;

beforeEach(async () => {
  rig = makeCompatRig();
  await recordReport(rig.storage, 'claude', compatReport('2.1.302', {}, tools('a', 'b')));
  await rig.storage.transaction(async (tx) => {
    for (const [tool, status] of [
      ['read', 'approved'],
      ['edit', 'denied'],
    ] as const) {
      const row = await tx.harnessToolSchemas.get('claude', '2.1.302', tool);
      if (row) {
        await tx.harnessToolSchemas.upsert({
          ...row,
          status,
          decided_by: 'owner',
          decided_at: '2026-10-10T10:00:00.000Z',
          decision_reason: 'looked fine',
        });
      }
    }
  });
});

describe('recordReport across builds', () => {
  it('carries approved and denied decisions of identical shapes to the new build', async () => {
    await recordReport(
      rig.storage,
      'claude',
      compatReport('2.1.304', {}, tools('a', 'b')),
    );

    const rows = await rig.rows('2.1.304');

    expect(rows.map((r) => [r.tool, r.status, r.decided_by])).toEqual([
      ['read', 'approved', 'carried:2.1.302'],
      ['edit', 'denied', 'carried:2.1.302'],
    ]);

    expect(rows[0]?.decided_at).toBeDefined();
    expect(rows[0]?.decision_reason).toMatch(/2\.1\.302/);
  });

  it('leaves a changed shape and a new tool pending', async () => {
    await recordReport(
      rig.storage,
      'claude',
      compatReport('2.1.304', {}, tools('a', 'c', true)),
    );

    const rows = await rig.rows('2.1.304');

    expect(rows.map((r) => [r.tool, r.status])).toEqual([
      ['read', 'approved'],
      ['edit', 'pending'],
      ['grep', 'pending'],
    ]);
  });

  it('leaves the first build of a harness pending', async () => {
    const rows = await rig.rows('2.1.302');

    expect(rows.map((r) => r.status)).toEqual(['approved', 'denied']);
    const fresh = makeCompatRig();
    await recordReport(
      fresh.storage,
      'claude',
      compatReport('1.0.0', {}, tools('a', 'b')),
    );

    expect((await fresh.rows('1.0.0')).map((r) => r.status)).toEqual([
      'pending',
      'pending',
    ]);
  });

  it('does not carry the same decision twice when the report is recorded again', async () => {
    const report = compatReport('2.1.304', {}, tools('a', 'b'));
    await recordReport(rig.storage, 'claude', report);
    await recordReport(rig.storage, 'claude', report);

    expect((await rig.rows('2.1.304')).map((r) => r.status)).toEqual([
      'approved',
      'denied',
    ]);
  });
});
