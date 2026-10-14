/**
 * Tests for the GithubConnection schema.
 *
 * Why: a connection names the App a company's repositories are reached through and where its
 *   private key sits in the secret store. The id becomes a secret-name segment, so a hostile
 *   id must be refused at the boundary, and the shape must have no place for key bytes so a
 *   response built from a connection cannot leak one (d-0094).
 *
 * Pins: a valid connection parses, ids that are not lowercase slugs and App ids that are
 *   not numeric are refused, unknown keys (a private key) are dropped.
 * Depends on: src/schemas/github-connection, vitest.
 */

import { describe, expect, it } from 'vitest';
import { GithubConnection } from '#/schemas/github-connection.js';

const ok = {
  id: 'acme',
  account: 'acme-inc',
  app_id: '12345',
  key_secret_name: 'github/acme/key',
  status: 'active',
  created_at: '2026-10-14T00:00:00.000Z',
};

describe('GithubConnection', () => {
  it('parses a connection with and without an app slug', () => {
    expect(GithubConnection.safeParse(ok).success).toBe(true);
    expect(GithubConnection.safeParse({ ...ok, app_slug: 'forge-acme' }).success).toBe(
      true,
    );
  });

  it('refuses ids that could climb out of the secret namespace and non-numeric App ids', () => {
    expect(GithubConnection.safeParse({ ...ok, id: '../x' }).success).toBe(false);
    expect(GithubConnection.safeParse({ ...ok, id: 'Acme' }).success).toBe(false);
    expect(GithubConnection.safeParse({ ...ok, app_id: 'abc' }).success).toBe(false);
  });

  it('has no field for key material', () => {
    const parsed = GithubConnection.parse({ ...ok, private_key_pem: 'SECRET' });
    expect(JSON.stringify(parsed)).not.toContain('SECRET');
  });
});
