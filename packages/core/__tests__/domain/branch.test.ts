/**
 * Tests for branch naming.
 *
 * Why: the branch name is the contract between the factory and the git host. If build
 *   and parse drift apart the PR bot cannot map a PR back to its ticket, and a
 *   human-made branch such as `main` could be mistaken for a factory branch and gated or
 *   merged as one (d-0021, control-room-and-platform.md §6).
 *
 * Pins: branch format `<type>/<id>-<slug>`, accent/non-ascii stripping, 40-char slug
 *   cap, `untitled` fallback, build/parse round trip (property), rejection of foreign
 *   branches.
 * Depends on: src/domain/branch, src/domain/ids, src/schemas/ticket, fast-check,
 *   vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { branchName, parseBranchName } from '#/domain/branch.js';
import { makeTicketId, parseTicketId } from '#/domain/ids.js';
import { TicketType } from '#/schemas/ticket.js';

const id = makeTicketId('SF', 12);

describe('branchName', () => {
  it('builds <type>/<id>-<slug>', () => {
    expect(branchName('feat', id, 'Add Doctor check!')).toBe(
      'feat/SF-12-add-doctor-check',
    );
  });

  it('strips accents and non-ascii, collapses separators', () => {
    expect(branchName('fix', id, '  Café -- naïve__thing / 日本  ')).toBe(
      'fix/SF-12-cafe-naive-thing',
    );
  });

  it('caps slug at 40 chars without trailing dash', () => {
    const b = branchName('chore', id, 'a'.repeat(39) + ' bbbbbbbb');
    const slug = b.slice('chore/SF-12-'.length);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('falls back when the title has no ascii content', () => {
    expect(branchName('docs', id, '日本語')).toBe('docs/SF-12-untitled');
  });

  it('round-trips through parseBranchName and parseTicketId', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TicketType.options),
        fc.integer({ min: 1, max: 99999 }),
        fc.string({ maxLength: 120 }),
        (type, n, title) => {
          const tid = makeTicketId('SF', n);
          const name = branchName(type, tid, title);
          const parsed = parseBranchName(name);
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) {
            return;
          }

          expect(parsed.value.type).toBe(type);
          expect(parsed.value.ticketId).toBe(tid);
          expect(parseTicketId(parsed.value.ticketId).ok).toBe(true);
          expect(parsed.value.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
          expect(parsed.value.slug.length).toBeLessThanOrEqual(40);
        },
      ),
    );
  });

  it('rejects foreign branch names', () => {
    expect(parseBranchName('main').ok).toBe(false);
    expect(parseBranchName('wip/SF-1-x').ok).toBe(false);
  });
});
