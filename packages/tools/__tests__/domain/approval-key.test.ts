/**
 * Pins approvalKey(): one stable identity per tool call for an owner's answer.
 *
 * Why: the owner approves an exact call and the resumed Worker repeats it. If the key moved
 * when the harness reworded its `description` or the command's spacing changed, the same
 * call would be asked twice; if it did not move when the command, the resource or the
 * harness schema changed, one approval would cover a different call. Shell commands stay
 * opaque tokenised segments, so the key is the same for any language or toolchain.
 *
 * Pins: approvalKey() for shell, path and plain tools.
 * Depends on: domain/approval-key, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { approvalKey } from '#/domain/approval-key.js';
import { call, makeCtx } from '#tests/helpers/fixtures.js';

const ctx = makeCtx('standard');
const sh = (command: string, extra: Record<string, unknown> = {}) =>
  call('shell', { command, ...extra }, { native: 'PowerShell' });

describe('approvalKey', () => {
  it('is stable across harness-only fields and whitespace', () => {
    const a = approvalKey(ctx, sh('cargo add serde'));
    const b = approvalKey(ctx, sh('cargo   add  serde', { description: 'add a crate' }));

    expect(a).not.toBeNull();
    expect(b).toBe(a);
  });

  it('changes with the command, even past the receipt clip', () => {
    const long = `pip install ${'a'.repeat(250)}`;

    expect(approvalKey(ctx, sh('cargo add serde'))).not.toBe(
      approvalKey(ctx, sh('cargo add evil')),
    );

    expect(approvalKey(ctx, sh(`${long}1`))).not.toBe(approvalKey(ctx, sh(`${long}2`)));
  });

  it('covers every segment of a chain', () => {
    expect(approvalKey(ctx, sh('go get x && go get y'))).not.toBe(
      approvalKey(ctx, sh('go get x')),
    );
  });

  it('normalises paths and separates tools', () => {
    const edit = (p: string) => approvalKey(ctx, call('edit', { file_path: p }));

    expect(edit('a/migrations/./1.sql')).toBe(edit('a/migrations/1.sql'));
    expect(edit('a/migrations/1.sql')).not.toBe(edit('a/migrations/2.sql'));
    expect(edit('a/migrations/1.sql')).not.toBe(
      approvalKey(ctx, call('write', { file_path: 'a/migrations/1.sql' })),
    );
  });

  it('keeps the whole URL of a plain tool', () => {
    const fetch = (url: string) =>
      approvalKey(ctx, call('mcp__forge__web_fetch', { url }));

    expect(fetch('https://a.example/x?y=1')).not.toBe(fetch('https://a.example/x?y=2'));
  });

  it('changes when the live schema hash changes', () => {
    const other = makeCtx('standard', {
      liveSchemaHashes: { ...ctx.liveSchemaHashes, shell: 'sha256:changed' },
    });

    expect(approvalKey(other, sh('cargo add serde'))).not.toBe(
      approvalKey(ctx, sh('cargo add serde')),
    );
  });

  it('has no key for a call that cannot be named (fail closed)', () => {
    expect(approvalKey(ctx, sh("echo 'unterminated"))).toBeNull();
    expect(approvalKey(ctx, call('edit', { file_path: 7 }))).toBeNull();
    expect(approvalKey(ctx, call('nope', {}))).toBeNull();
    expect(approvalKey(ctx, call('shell', {}))).toBeNull();
  });
});
