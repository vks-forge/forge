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
