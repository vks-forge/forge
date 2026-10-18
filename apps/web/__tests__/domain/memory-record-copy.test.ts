/**
 * Pins: the record page's wording: provenance in one sentence per author and state, links
 * grouped by relation with the replaced/replaced-by pair and links to the right page, history
 * lines with the state move, search-aid versions, and the note on an imported record.
 *
 * Why: the owner decides whether to trust a record from these sentences. "Approved by you" on a
 * record the owner never answered, a card link that opens a ticket, or an import note that hides
 * which fields were defaulted would each mislead.
 * Depends on: domain/memory-record-copy. Pure.
 */

import { describe, expect, it } from 'vitest';
import {
  aidVersionLine,
  eventLine,
  importNote,
  linkGroups,
  linkHref,
  provenanceLine,
} from '#/domain/memory-record-copy.js';

const base = {
  author: 'user',
  kind: 'decision',
  status: 'active',
} as const;

describe('provenanceLine', () => {
  it('says whose word each kind of record is', () => {
    expect(provenanceLine(base)).toBe('Your decision');
    expect(
      provenanceLine({
        ...base,
        author: 'director',
        approved_at: '2026-10-12T08:00:00Z',
      }),
    ).toBe("Director's inference, approved by you on 2026-10-12");

    expect(provenanceLine({ ...base, author: 'director' })).toBe("Director's inference");
    expect(
      provenanceLine({
        ...base,
        author: 'director',
        kind: 'proposal',
        status: 'pending',
      }),
    ).toBe("Director's inference, waiting for your answer");

    expect(
      provenanceLine({
        ...base,
        author: 'director',
        kind: 'rejected',
        status: 'rejected',
        rejected_at: '2026-09-03',
      }),
    ).toBe("Director's inference, rejected by you on 2026-09-03");

    expect(provenanceLine({ ...base, kind: 'rejected', status: 'rejected' })).toBe(
      'An approach you ruled out',
    );

    expect(provenanceLine({ ...base, author: 'director', kind: 'outcome' })).toBe(
      'An outcome the Director recorded',
    );
  });
});

describe('linkGroups and linkHref', () => {
  it('groups by relation, shows supersedes once and adds replaced-by', () => {
    const groups = linkGroups({
      supersedes: 'd-0003',
      superseded_by: null,
      links: [
        { rel: 'supersedes', target_kind: 'record', target: 'd-0003' },
        { rel: 'amends', target_kind: 'record', target: 'd-0001' },
        { rel: 'cites', target_kind: 'record', target: 'd-0002' },
        { rel: 'ticket', target_kind: 'ticket', target: 'SVC-9' },
      ],
    });

    expect(groups.map((g) => g.label)).toEqual(['Replaces', 'Amends', 'Cites', 'Ticket']);
    expect(groups[0]?.items).toEqual([{ kind: 'record', target: 'd-0003' }]);
    expect(
      linkGroups({ supersedes: null, superseded_by: 'd-0006', links: [] })[0],
    ).toEqual({
      label: 'Replaced by',
      items: [{ kind: 'record', target: 'd-0006' }],
    });

    expect(linkGroups({ supersedes: null, superseded_by: null, links: [] })).toEqual([]);
  });

  it('sends each kind of target to its own page', () => {
    expect(linkHref('p', { kind: 'record', target: 'd-0001' })).toBe(
      '/p/p/memory/d-0001',
    );

    expect(linkHref('p', { kind: 'card', target: 'C-1' })).toBe('/p/p/cards/C-1');
    expect(linkHref('p', { kind: 'ticket', target: 'T-1' })).toBe('/p/p/tickets/T-1');
  });
});

describe('history and import wording', () => {
  it('describes an event with its state move', () => {
    const event = {
      seq: 2,
      id: 'd-0003',
      at: '2026-09-20T10:00:00Z',
      actor: 'owner',
      event: 'superseded',
      from_status: 'active',
      to_status: 'superseded',
      reason: null,
    } as const;

    expect(eventLine(event)).toBe('Replaced by a newer decision (active to superseded)');
    expect(
      eventLine({ ...event, event: 'aids_set', from_status: null, to_status: null }),
    ).toBe('Search aids changed');

    expect(
      eventLine({ ...event, event: 'proposed', from_status: null, to_status: 'pending' }),
    ).toBe('Proposed (waiting for you)');
  });

  it('describes a version of the search aids', () => {
    expect(
      aidVersionLine({
        version: 1,
        at: 'x',
        actor: 'director',
        gist: 'short',
        aliases: 'a b\nc',
        pinned: true,
      }),
    ).toBe('gist “short”, aliases a b, c, pinned');

    expect(
      aidVersionLine({
        version: 2,
        at: 'x',
        actor: 'd',
        gist: null,
        aliases: null,
        pinned: false,
      }),
    ).toBe('no gist, no aliases, not pinned');
  });

  it('says which fields an import filled in, or that nothing was missing', () => {
    expect(
      importNote(
        { from: 'decisions/d-1.md@abc', defaulted_fields: ['author'] },
        '2026-10-18T09:00:00Z',
      ),
    ).toBe(
      'Imported from the old repository on 2026-10-18 (decisions/d-1.md@abc). 1 field was filled with defaults: author.',
    );

    expect(importNote({ from: 'x@y', defaulted_fields: [] }, undefined)).toBe(
      'Imported from the old repository (x@y). Nothing was missing.',
    );
  });
});
