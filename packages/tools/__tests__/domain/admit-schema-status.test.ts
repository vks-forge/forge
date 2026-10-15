/**
 * Pins how admit() refuses a native tool whose schema is not approved for the installed build.
 *
 * Why: a new harness build, or a hand-edited tool schema, must stop that tool until the owner
 * approves it (d-0088), and the owner must be told whether it is waiting (`schema_pending`)
 * or was refused (`schema_denied`). Both must be refused when the model lists tools as well
 * as when it calls one, and must never touch a tool whose schema is approved or that is not
 * native.
 *
 * Pins: admit() with `schemaStatus`; visibleTools() agreement.
 * Depends on: domain/admit, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { admit, visibleTools } from '#/domain/admit.js';
import { call, makeCtx } from '#tests/helpers/fixtures.js';

const ctx = (status: Record<string, 'pending' | 'denied'>) =>
  makeCtx('full', { schemaStatus: status });

describe('schema status', () => {
  it('denies a pending native tool as schema_pending and an unrelated one stays allowed', () => {
    const c = ctx({ read: 'pending' });

    expect(admit(c, call('read', { path: 'a.ts' }))).toMatchObject({
      decision: 'deny',
      reason: 'schema_pending',
    });

    expect(admit(c, call('grep', { pattern: 'x' })).decision).not.toBe('deny');
  });

  it('denies a denied native tool as schema_denied', () => {
    expect(admit(ctx({ edit: 'denied' }), call('edit', { path: 'a.ts' }))).toMatchObject({
      decision: 'deny',
      reason: 'schema_denied',
    });
  });

  it('hides a pending tool from the listing, like it refuses the call', () => {
    const listed = visibleTools(ctx({ read: 'pending' })).map((t) => t.id);

    expect(listed).not.toContain('read');
    expect(listed).toContain('grep');
  });

  it('does not read an inherited property as a status', () => {
    expect(admit(ctx({}), call('read', { path: 'a.ts' }))).not.toMatchObject({
      reason: 'schema_pending',
    });
  });
});
