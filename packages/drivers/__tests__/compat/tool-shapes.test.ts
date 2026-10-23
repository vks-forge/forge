/**
 * Tool shape fingerprints and their diff against approved rows.
 *
 * Why: a hand-edited or upgraded tool schema must show up as pending, while an unchanged one
 * must need no action, or the owner would be asked to re-approve every tool on every check.
 * The fingerprint has to depend on the schema and the name but not on the order the harness
 * lists its tools, and a capability with several harness names (`shell`) must change when any
 * of them changes.
 *
 * Pins: hashToolSchema(), toolShapes(), diffToolShapes().
 * Depends on: src/compat/tool-shapes. No IO.
 */

import type { HarnessToolSchema } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { diffToolShapes, hashToolSchema, toolShapes } from '#/compat/tool-shapes.js';

const read = {
  name: 'Read',
  input_schema: { type: 'object', properties: { file_path: {} } },
};

const bash = {
  name: 'Bash',
  input_schema: { type: 'object', properties: { command: {} } },
};

const power = {
  name: 'PowerShell',
  input_schema: { type: 'object', properties: { command: {} } },
};

const NATIVE = { read: ['Read'], shell: ['Bash', 'PowerShell'], task: ['Task', 'Agent'] };

describe('hashToolSchema', () => {
  it('is stable, key-order independent, and changes with the name or any schema field', () => {
    const reordered = {
      name: 'Read',
      input_schema: { properties: { file_path: {} }, type: 'object' },
    };

    expect(hashToolSchema(read)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hashToolSchema(reordered)).toBe(hashToolSchema(read));
    expect(hashToolSchema({ ...read, name: 'Read2' })).not.toBe(hashToolSchema(read));
    expect(
      hashToolSchema({
        ...read,
        input_schema: { type: 'object', properties: { file_path: {}, offset: {} } },
      }),
    ).not.toBe(hashToolSchema(read));
  });
});

describe('toolShapes', () => {
  it('maps harness names to catalogue tools and skips tools the build does not offer', () => {
    const shapes = toolShapes([read, bash], NATIVE);

    expect(shapes.map((s) => [s.tool, s.native])).toEqual([
      ['read', ['Read']],
      ['shell', ['Bash']],
    ]);
  });

  it('covers every name a capability has, in a listing-order independent way', () => {
    const a = toolShapes([bash, power], NATIVE).find((s) => s.tool === 'shell');
    const b = toolShapes([power, bash], NATIVE).find((s) => s.tool === 'shell');
    const bashOnly = toolShapes([bash], NATIVE).find((s) => s.tool === 'shell');

    expect(a?.native).toEqual(['Bash', 'PowerShell']);
    expect(a?.schema_hash).toBe(b?.schema_hash);
    expect(a?.schema_hash).not.toBe(bashOnly?.schema_hash);
  });

  it('takes the renamed name when the build offers it', () => {
    const agent = { name: 'Agent', input_schema: { type: 'object' } };

    expect(toolShapes([agent], NATIVE)[0]).toMatchObject({
      tool: 'task',
      native: ['Agent'],
    });
  });
});

describe('diffToolShapes', () => {
  const shapes = toolShapes([read, bash], NATIVE);
  const row = (
    tool: string,
    status: HarnessToolSchema['status'],
    schema_hash = shapes.find((s) => s.tool === tool)?.schema_hash ?? '',
  ): HarnessToolSchema => ({
    harness_kind: 'claude',
    version: '1',
    tool,
    schema_hash,
    status,
  });

  it('keeps unchanged approved and denied rows and sets the rest pending', () => {
    const diff = diffToolShapes(shapes, [
      row('read', 'approved'),
      row('shell', 'denied'),
    ]);

    expect(diff.keep).toEqual(['read', 'shell']);
    expect(diff.pending).toEqual([]);
  });

  it('sets a changed hash, a new tool and an undecided row pending', () => {
    const changed = diffToolShapes(shapes, [
      row('read', 'approved', `sha256:${'0'.repeat(64)}`),
      row('shell', 'pending'),
    ]);

    expect(changed.keep).toEqual([]);
    expect(changed.pending.map((s) => s.tool)).toEqual(['read', 'shell']);
    expect(diffToolShapes(shapes, []).pending).toHaveLength(2);
  });
});

describe('diffToolShapes with earlier builds', () => {
  const shapes = toolShapes([read, bash], NATIVE);
  const earlier = (
    tool: string,
    status: HarnessToolSchema['status'],
    over: Partial<HarnessToolSchema> = {},
  ): HarnessToolSchema => ({
    harness_kind: 'claude',
    version: '1',
    tool,
    schema_hash: shapes.find((s) => s.tool === tool)?.schema_hash ?? '',
    status,
    decided_by: 'owner',
    decided_at: '2026-10-01T10:00:00.000Z',
    ...over,
  });

  it('carries an approved decision on the same hash forward', () => {
    const diff = diffToolShapes(shapes, [], [earlier('read', 'approved')]);

    expect(diff.pending.map((s) => s.tool)).toEqual(['shell']);
    expect(diff.carried).toEqual([
      { shape: shapes.find((s) => s.tool === 'read'), from: earlier('read', 'approved') },
    ]);
  });

  it('carries a denied decision on the same hash forward', () => {
    const diff = diffToolShapes(shapes, [], [earlier('shell', 'denied')]);

    expect(diff.carried.map((c) => [c.shape.tool, c.from.status])).toEqual([
      ['shell', 'denied'],
    ]);
  });

  it('keeps a changed hash pending', () => {
    const diff = diffToolShapes(
      shapes,
      [],
      [earlier('read', 'approved', { schema_hash: `sha256:${'0'.repeat(64)}` })],
    );

    expect(diff.carried).toEqual([]);
    expect(diff.pending.map((s) => s.tool)).toEqual(['read', 'shell']);
  });

  it('keeps a tool no earlier build knew pending, and ignores undecided rows', () => {
    const diff = diffToolShapes(shapes, [], [earlier('read', 'pending')]);

    expect(diff.carried).toEqual([]);
    expect(diff.pending).toHaveLength(2);
  });

  it('keeps everything pending with no earlier build', () => {
    expect(diffToolShapes(shapes, [], []).pending).toHaveLength(2);
  });

  it('follows the most recent decision when builds disagree on the same hash', () => {
    const diff = diffToolShapes(
      shapes,
      [],
      [
        earlier('read', 'approved', {
          version: '1',
          decided_at: '2026-10-01T10:00:00.000Z',
        }),
        earlier('read', 'denied', {
          version: '2',
          decided_at: '2026-10-05T10:00:00.000Z',
        }),
      ],
    );

    expect(diff.carried.map((c) => [c.from.version, c.from.status])).toEqual([
      ['2', 'denied'],
    ]);
  });

  it('prefers the build own decided row over an earlier build', () => {
    const own = { ...earlier('read', 'denied'), version: '3' };
    const diff = diffToolShapes(shapes, [own], [earlier('read', 'approved')]);

    expect(diff.keep).toEqual(['read']);
    expect(diff.carried).toEqual([]);
  });
});
