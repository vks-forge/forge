/**
 * Project-scoped SSE tickets: bound to one project slug, never to a run.
 *
 * Why: the project stream carries every card id and title of a project, and it is opened by a
 *   ticket in the URL. A ticket minted for one project must not open another, and the two
 *   kinds of ticket (run and project) must never be interchangeable, even when a run id and a
 *   project slug are the same string, or a run ticket could read a project's live changes.
 *
 * Pins: project tickets verify for their slug until the sixty seconds are over; not for another
 *   slug; not as a run ticket; a run ticket does not verify as a project one, whatever the
 *   name; edited expiry or signature fails; the guard honours each kind only on its own path.
 * Depends on: src/services/auth/{sse-tickets,guard}, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { createAuthGuard } from '#/services/auth/guard.js';
import {
  SSE_TICKET_TTL_SECONDS,
  createSseTicketIssuer,
} from '#/services/auth/sse-tickets.js';

const clock = { now: 5_000 };
const issuer = createSseTicketIssuer(() => clock.now);

describe('project SSE tickets', () => {
  it('verifies for its project until the sixty seconds are over', () => {
    clock.now = 5_000;
    const { ticket, expiresInSeconds } = issuer.issueProject('dcp');

    expect(expiresInSeconds).toBe(SSE_TICKET_TTL_SECONDS);
    expect(issuer.verifyProject(ticket, 'dcp')).toBe(true);

    clock.now = 5_000 + 59_999;
    expect(issuer.verifyProject(ticket, 'dcp')).toBe(true);

    clock.now = 5_000 + 60_000;
    expect(issuer.verifyProject(ticket, 'dcp')).toBe(false);
  });

  it('does not verify for another project', () => {
    clock.now = 5_000;
    const { ticket } = issuer.issueProject('dcp');

    expect(issuer.verifyProject(ticket, 'other')).toBe(false);
  });

  it('keeps run and project tickets apart, even for the same string', () => {
    clock.now = 5_000;
    const run = issuer.issue('same').ticket;
    const project = issuer.issueProject('same').ticket;

    expect(issuer.verifyProject(run, 'same')).toBe(false);
    expect(issuer.verify(project, 'same')).toBe(false);
    expect(issuer.verify(run, 'same')).toBe(true);
    expect(issuer.verifyProject(project, 'same')).toBe(true);
  });

  it('does not verify with an edited expiry, an edited signature or a malformed ticket', () => {
    clock.now = 5_000;
    const [expiry, signature] = issuer.issueProject('dcp').ticket.split('.');

    expect(issuer.verifyProject(`${Number(expiry) + 1}.${signature}`, 'dcp')).toBe(false);
    expect(issuer.verifyProject(`${expiry}.${signature?.slice(1)}x`, 'dcp')).toBe(false);
    for (const bad of ['', 'abc', '1.2.3', 'NaN.sig']) {
      expect(issuer.verifyProject(bad, 'dcp'), bad).toBe(false);
    }
  });

  it('is not valid across two issuers with different keys (a restart)', () => {
    const other = createSseTicketIssuer(() => clock.now);

    clock.now = 5_000;

    expect(other.verifyProject(issuer.issueProject('dcp').ticket, 'dcp')).toBe(false);
  });
});

describe('guard and ticket scope', () => {
  const guard = createAuthGuard('install-token', issuer);
  const request = (over: Record<string, unknown>) => ({
    access: 'token_or_ticket' as const,
    authorization: undefined,
    ticket: null,
    runId: undefined,
    ...over,
  });

  it('lets a project ticket through on its project path only', () => {
    clock.now = 5_000;
    const { ticket } = issuer.issueProject('dcp');

    expect(guard.allows(request({ ticket, projectSlug: 'dcp' }))).toBe(true);
    expect(guard.allows(request({ ticket, projectSlug: 'other' }))).toBe(false);
    expect(guard.allows(request({ ticket, runId: 'dcp' }))).toBe(false);
    expect(guard.allows(request({ ticket }))).toBe(false);
  });

  it('lets a run ticket through on its run path only, not on a project path', () => {
    clock.now = 5_000;
    const { ticket } = issuer.issue('run-1');

    expect(guard.allows(request({ ticket, runId: 'run-1' }))).toBe(true);
    expect(guard.allows(request({ ticket, runId: 'run-2' }))).toBe(false);
    expect(guard.allows(request({ ticket, projectSlug: 'run-1' }))).toBe(false);
  });

  it('ignores a ticket on a route that is not a stream', () => {
    clock.now = 5_000;
    const { ticket } = issuer.issueProject('dcp');

    expect(guard.allows(request({ ticket, projectSlug: 'dcp', access: 'token' }))).toBe(
      false,
    );
  });
});
