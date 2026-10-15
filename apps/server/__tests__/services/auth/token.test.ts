/**
 * Bearer parsing, constant-time comparison, signed SSE tickets, and the access guard.
 *
 * Why: these four small functions are the whole decision "may this caller in". A parser that
 *   accepts a malformed header, a comparison that throws on unequal lengths, a ticket that
 *   survives its expiry or verifies for another run, or a guard that lets `open` semantics leak
 *   to the ticket path would each be an authentication bypass.
 *
 * Pins: bearerOf() shapes; tokensEqual() on equal, unequal and different-length input; ticket
 *   issue/verify/expiry/run binding/tamper; guard truth table.
 * Depends on: src/services/auth/{token,sse-tickets,guard}. No IO.
 */

import { describe, expect, it } from 'vitest';
import { createAuthGuard } from '#/services/auth/guard.js';
import {
  SSE_TICKET_TTL_SECONDS,
  createSseTicketIssuer,
} from '#/services/auth/sse-tickets.js';
import { bearerOf, tokensEqual } from '#/services/auth/token.js';

describe('bearerOf', () => {
  it.each([
    ['Bearer abc', 'abc'],
    ['bearer abc', 'abc'],
    ['Bearer   abc  ', 'abc'],
  ])('reads %j', (header, token) => {
    expect(bearerOf(header)).toBe(token);
  });

  it.each([undefined, '', 'Bearer', 'Bearer ', 'Basic abc', 'abc'])(
    'finds no token in %j',
    (header) => {
      expect(bearerOf(header)).toBeUndefined();
    },
  );
});

describe('tokensEqual', () => {
  it('is true only for identical strings, whatever their lengths', () => {
    expect(tokensEqual('same', 'same')).toBe(true);
    expect(tokensEqual('same', 'sama')).toBe(false);
    expect(tokensEqual('short', 'a-much-longer-token')).toBe(false);
    expect(tokensEqual('', 'x')).toBe(false);
  });
});

describe('SSE tickets', () => {
  const clock = { now: 5_000 };
  const issuer = createSseTicketIssuer(() => clock.now);

  it('verifies for its run until the sixty seconds are over', () => {
    clock.now = 5_000;
    const { ticket, expiresInSeconds } = issuer.issue('run-1');

    expect(expiresInSeconds).toBe(SSE_TICKET_TTL_SECONDS);
    expect(issuer.verify(ticket, 'run-1')).toBe(true);

    clock.now = 5_000 + 59_999;
    expect(issuer.verify(ticket, 'run-1')).toBe(true);

    clock.now = 5_000 + 60_000;
    expect(issuer.verify(ticket, 'run-1')).toBe(false);
  });

  it('does not verify for another run', () => {
    clock.now = 5_000;
    const { ticket } = issuer.issue('run-1');

    expect(issuer.verify(ticket, 'run-2')).toBe(false);
  });

  it('does not verify with an edited expiry or signature', () => {
    clock.now = 5_000;
    const [expiry, signature] = issuer.issue('run-1').ticket.split('.');

    expect(issuer.verify(`${Number(expiry) + 1}.${signature}`, 'run-1')).toBe(false);
    expect(issuer.verify(`${expiry}.${signature?.slice(1)}x`, 'run-1')).toBe(false);
    expect(issuer.verify(`${expiry}.`, 'run-1')).toBe(false);
  });

  it('does not verify a ticket signed by another process key', () => {
    clock.now = 5_000;
    const other = createSseTicketIssuer(() => clock.now);

    expect(issuer.verify(other.issue('run-1').ticket, 'run-1')).toBe(false);
  });
});

describe('createAuthGuard', () => {
  const issuer = createSseTicketIssuer(() => 1_000);
  const guard = createAuthGuard('the-install-token', issuer);
  const base = { authorization: undefined, ticket: null, runId: undefined };
  const { ticket } = issuer.issue('run-1');

  it('lets an open route through for anyone', () => {
    expect(guard.allows({ ...base, access: 'open' })).toBe(true);
  });

  it('requires the install token on a token route', () => {
    expect(guard.allows({ ...base, access: 'token' })).toBe(false);
    expect(
      guard.allows({
        ...base,
        access: 'token',
        authorization: 'Bearer the-install-token',
      }),
    ).toBe(true);

    expect(guard.allows({ ...base, access: 'token', authorization: 'Bearer nope' })).toBe(
      false,
    );
  });

  it('accepts a ticket only on a token_or_ticket route, for its own run', () => {
    const withTicket = { ...base, ticket, runId: 'run-1' };

    expect(guard.allows({ ...withTicket, access: 'token_or_ticket' })).toBe(true);
    expect(guard.allows({ ...withTicket, access: 'token' })).toBe(false);
    expect(
      guard.allows({ ...withTicket, access: 'token_or_ticket', runId: 'run-2' }),
    ).toBe(false);

    expect(
      guard.allows({ ...withTicket, access: 'token_or_ticket', runId: undefined }),
    ).toBe(false);
  });
});
