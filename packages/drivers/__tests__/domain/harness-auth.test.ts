/**
 * Pins: how a harness auth mode becomes child environment and an accepted login report.
 *
 * Why: the auth mode decides who pays for a Worker. If an API-key harness started a session
 * on a subscription report, or an OAuth-token harness was refused because the adapter said
 * `none` before the session existed, the owner would either be billed on the wrong account
 * or be unable to run at all. The tables are pure so each rule is pinned without a process.
 *
 * Depends on: src/domain/harness-auth. No IO.
 */

import { describe, expect, it } from 'vitest';
import {
  accountKindFromCliStatus,
  authEnvFor,
  authVerdict,
  expectedCliKind,
} from '#/domain/harness-auth.js';

describe('authEnvFor', () => {
  it('maps each mode to exactly one variable, and login to none', () => {
    expect(authEnvFor('api_key', 'sk-1')).toEqual({ ANTHROPIC_API_KEY: 'sk-1' });
    expect(authEnvFor('oauth_token', 'tok')).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: 'tok' });
    expect(authEnvFor('login', 'ignored')).toEqual({});
  });

  it('gives nothing when there is no secret to inject', () => {
    expect(authEnvFor('api_key', null)).toEqual({});
  });
});

describe('authVerdict (adapter _auth/status_update kinds, measured on claude 2.1.299)', () => {
  it('login accepts an account, rejects none and waits through other kinds', () => {
    expect(authVerdict('login', 'account')).toBe('accept');
    expect(authVerdict('login', 'none')).toBe('reject');
    expect(authVerdict('login', 'api_key')).toBe('ignore');
  });

  it('api_key accepts only api_key, so a subscription report never passes as the key', () => {
    expect(authVerdict('api_key', 'api_key')).toBe('accept');
    expect(authVerdict('api_key', 'account')).toBe('ignore');
    expect(authVerdict('api_key', 'none')).toBe('ignore');
  });

  it('oauth_token accepts any report, because a setup-token carries no plan', () => {
    for (const kind of ['account', 'none', 'api_key', 'external']) {
      expect(authVerdict('oauth_token', kind)).toBe('accept');
    }
  });
});

describe('accountKindFromCliStatus (claude auth status --json)', () => {
  it('reads the login, the API key and the OAuth token the CLI reports', () => {
    expect(
      accountKindFromCliStatus(
        JSON.stringify({
          loggedIn: true,
          authMethod: 'claude.ai',
          subscriptionType: 'max',
        }),
      ),
    ).toBe('account');

    expect(
      accountKindFromCliStatus(
        JSON.stringify({
          loggedIn: true,
          authMethod: 'api_key',
          apiKeySource: 'ANTHROPIC_API_KEY',
        }),
      ),
    ).toBe('api_key');

    expect(
      accountKindFromCliStatus(
        JSON.stringify({ loggedIn: true, authMethod: 'oauth_token' }),
      ),
    ).toBe('oauth_token');

    expect(accountKindFromCliStatus(JSON.stringify({ loggedIn: false }))).toBe('none');
  });

  it('returns null for output that is not the status document', () => {
    expect(accountKindFromCliStatus('not json')).toBeNull();
    expect(accountKindFromCliStatus('{}')).toBeNull();
    expect(accountKindFromCliStatus('[]')).toBeNull();
  });

  it('expects the matching kind per mode', () => {
    expect(expectedCliKind('login')).toBe('account');
    expect(expectedCliKind('api_key')).toBe('api_key');
    expect(expectedCliKind('oauth_token')).toBe('oauth_token');
  });
});
