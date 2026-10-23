/**
 * Pins validation of the owner-approved "always" rules on a grant.
 *
 * Why: "Always for this project" is one click that becomes a standing permission, so the stored
 * rule must stay as narrow as the call the owner saw. A wildcard, an interpreter, a strict
 * lane condition or a protected path in that list would turn one approval into a broad one;
 * saving such a rule must be refused, and loading one must fail closed. Only the project
 * grant's list counts, so a ticket cannot grant itself consent.
 *
 * Pins: Grant.approved, assertValidApproved(), parseGrant(), effectiveGrant().approved.
 * Depends on: domain/grants, schemas/grant, shared/errors, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { assertValidApproved, effectiveGrant, parseGrant } from '#/domain/grants.js';
import { Grant } from '#/schemas/grant.js';
import type { ApprovedRule } from '#/schemas/grant.js';
import { InvalidGrantError } from '#/shared/errors.js';
import { FLOORS, grant } from '#tests/helpers/fixtures.js';

const rule = (
  action: string,
  resource: string,
  over: Record<string, unknown> = {},
): ApprovedRule =>
  ({
    id: 'a1',
    action,
    resource,
    effect: 'allow',
    created_at: '2026-10-20T10:00:00.000Z',
    source: { ticket_id: 'FG-1', interaction_id: 'int-1' },
    ...over,
  }) as ApprovedRule;

const parse = (r: ApprovedRule) => parseGrant({ approved: [r] });

describe('Grant.approved', () => {
  it('defaults to an empty list', () => {
    expect(Grant.parse({}).approved).toEqual([]);
  });

  it('accepts exact shell commands and sensitive folders', () => {
    expect(() => parse(rule('shell', 'cargo add serde'))).not.toThrow();
    expect(() => parse(rule('edit', 'prisma/migrations/**'))).not.toThrow();
  });

  it('refuses anything but allow', () => {
    expect(() => parse(rule('shell', 'cargo add serde', { effect: 'ask' }))).toThrow();
    expect(() => parse(rule('shell', 'cargo add serde', { effect: 'deny' }))).toThrow();
  });

  it('refuses a strict condition, a shell wildcard and the banned list', () => {
    expect(() =>
      assertValidApproved([rule('shell', 'cargo add serde', { strict: { cwd: '/x' } })]),
    ).toThrow(InvalidGrantError);

    expect(() => parse(rule('shell', 'cargo add*'))).toThrow(InvalidGrantError);
    expect(() => parse(rule('shell', 'cargo add ?'))).toThrow(InvalidGrantError);
    expect(() => parse(rule('shell', 'bash -c ls'))).toThrow(InvalidGrantError);
    expect(() => parse(rule('shell', 'git'))).toThrow(InvalidGrantError);
  });

  it('refuses a rule that covers a protected path', () => {
    for (const resource of ['CLAUDE.md', '.forge/**', '**', 'docs/CLAUDE.md']) {
      expect(() => parse(rule('edit', resource)), resource).toThrow(InvalidGrantError);
    }
  });

  it('fails closed on a malformed row', () => {
    expect(() => parseGrant({ approved: [{ action: 'shell' }] })).toThrow(
      InvalidGrantError,
    );
  });
});

describe('effectiveGrant().approved', () => {
  it('comes from the project grant only, as allow rules with provenance ids', () => {
    const eff = effectiveGrant(
      'standard',
      grant({ approved: [rule('shell', 'cargo add serde')] }),
      grant({ approved: [rule('shell', 'make install', { id: 't1' })] }),
      [],
      FLOORS,
    );

    expect(eff.approved).toEqual([
      {
        id: 'project:approved#a1',
        action: 'shell',
        resource: 'cargo add serde',
        effect: 'allow',
      },
    ]);
  });

  it('is empty without a project grant', () => {
    expect(effectiveGrant('standard', undefined, undefined, [], FLOORS).approved).toEqual(
      [],
    );
  });

  it('refuses to build a grant holding an invalid approved rule', () => {
    expect(() =>
      effectiveGrant(
        'standard',
        grant({ approved: [rule('shell', 'cargo add*')] }),
        undefined,
        [],
        FLOORS,
      ),
    ).toThrow(InvalidGrantError);
  });
});
