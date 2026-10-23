/**
 * Pins approvalWhat(): the text the owner reads before allowing a call.
 *
 * Why: consent must be about the call itself. The text comes from the tokenised command, the
 * normalised path or the whole URL, never from the harness's `description` field, and it is
 * bounded so one call cannot flood the owner's screen.
 *
 * Pins: approvalWhat() for shell, path and plain tools.
 * Depends on: domain/approval-what, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { APPROVAL_WHAT_MAX, approvalWhat } from '#/domain/approval-what.js';
import { call, makeCtx } from '#tests/helpers/fixtures.js';

const ctx = makeCtx('standard');

describe('approvalWhat', () => {
  it('shows every shell segment in full and ignores the Worker description', () => {
    const text = approvalWhat(
      ctx,
      call('shell', { command: 'cargo add serde', description: 'harmless note' }),
    );

    expect(text).toBe('cargo add serde');
  });

  it('names the normalised path of a path tool', () => {
    expect(approvalWhat(ctx, call('edit', { file_path: 'db/migrations/./1.sql' }))).toBe(
      'edit db/migrations/1.sql',
    );
  });

  it('clips a very long command', () => {
    const text = approvalWhat(
      ctx,
      call('shell', { command: `echo ${'a'.repeat(5000)}` }),
    );

    expect(text).toHaveLength(APPROVAL_WHAT_MAX);
  });

  it('falls back to the tool id when the tool is unknown', () => {
    expect(approvalWhat(ctx, call('no_such_tool', {}))).toBe('no_such_tool');
  });
});
