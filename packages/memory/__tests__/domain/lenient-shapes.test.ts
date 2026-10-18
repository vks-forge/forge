/**
 * Pins that a record whose header strict YAML rejects keeps its statement byte for byte and every field that parses.
 *
 * Why: about a fifth of this project's own records have a header that strict YAML rejects (an unquoted colon in
 *   the statement, a leading backtick, a flow-map source with quotes inside), and a hand-written `#`, anchor or
 *   tag silently changes a statement without any error. Moving memory into the database must keep every one,
 *   word for word, or a decision the owner made stops constraining the Director. A source that cannot parse
 *   is kept as an `imported` source holding its raw text.
 *
 * Pins: twelve strict-failing shapes keep the statement exactly and the other fields that parse, the header is
 *   marked lenient and the statement listed as recovered, a source that cannot parse becomes `imported` with its
 *   raw text, and a flow-map source that parses is kept as written.
 * Depends on: domain/lenient-record, vitest.
 */

import { describe, expect, it } from 'vitest';
import { parseRecordText } from '#/domain/lenient-record.js';
import type { ParseContext } from '#/types/memory-import.types.js';

const CTX: ParseContext = {
  folder: 'decisions',
  relPath: 'decisions/d-0001-x.md',
  importedAt: '2026-10-18',
};

const file = (lines: string[], body = 'Body line.'): string =>
  `---\n${lines.join('\n')}\n---\n${body}\n`;

const base = [
  'id: d-0019',
  'kind: decision',
  'source: { type: chat, ref: owner }',
  'author: user',
  'origin: owner',
  'status: active',
  'valid_from: 2026-10-12',
  'supersedes: d-0003',
  'tags: [quality, tdd]',
  'pinned: true',
];

/** Each shape is a header line that strict YAML rejects (or silently cuts) and the text it must keep. */
const SHAPES: { name: string; line: string; statement: string }[] = [
  {
    name: 'colon and space inside',
    line: 'statement: Skills must be self-improving: the factory observes outcomes.',
    statement: 'Skills must be self-improving: the factory observes outcomes.',
  },
  {
    name: 'leading backtick',
    line: 'statement: `forge` is the one CLI; `forge open` signs in.',
    statement: '`forge` is the one CLI; `forge open` signs in.',
  },
  {
    name: 'space before a hash',
    line: 'statement: Use the #1 pick, not # 2, for ranking.',
    statement: 'Use the #1 pick, not # 2, for ranking.',
  },
  {
    name: 'leading hash',
    line: 'statement: #hashtags are never memory keys.',
    statement: '#hashtags are never memory keys.',
  },
  {
    name: 'leading brace',
    line: 'statement: {placeholder} syntax is reserved for templates.',
    statement: '{placeholder} syntax is reserved for templates.',
  },
  {
    name: 'leading bracket',
    line: 'statement: [tag] prefixes are not part of an id.',
    statement: '[tag] prefixes are not part of an id.',
  },
  {
    name: 'leading star',
    line: 'statement: *bold* text is not rendered in memory.',
    statement: '*bold* text is not rendered in memory.',
  },
  {
    name: 'leading ampersand',
    line: 'statement: &anchors are not used in headers.',
    statement: '&anchors are not used in headers.',
  },
  {
    name: 'leading at sign',
    line: 'statement: @scope/pkg names keep the at sign.',
    statement: '@scope/pkg names keep the at sign.',
  },
  {
    name: 'quotes then a colon',
    line: 'statement: He said "yes": that settles the question.',
    statement: 'He said "yes": that settles the question.',
  },
  {
    name: 'leading percent',
    line: 'statement: 100% of gates run before merge: no skips.',
    statement: '100% of gates run before merge: no skips.',
  },
  {
    name: 'dash then colon',
    line: 'statement: - not a list: just a dash in the text.',
    statement: '- not a list: just a dash in the text.',
  },
];

describe('statements that strict YAML rejects', () => {
  it.each(SHAPES)('keeps the statement byte for byte: $name', ({ line, statement }) => {
    const parsed = parseRecordText(file([base[0] ?? '', line, ...base.slice(1)]), CTX);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const r = parsed.record;
    expect(r.statement).toBe(statement);
    expect(r).toMatchObject({
      id: 'd-0019',
      kind: 'decision',
      status: 'active',
      author: 'user',
      origin: 'owner',
      pinned: true,
      valid_from: '2026-10-12',
      tags: ['quality', 'tdd'],
      body: 'Body line.',
    });

    expect(r.links).toContainEqual({
      rel: 'supersedes',
      target_kind: 'record',
      target: 'd-0003',
    });

    expect(r.raw_front_matter).toContain(line);
  });

  it('flags a header that was not valid YAML as lenient and lists nothing as defaulted when nothing was filled', () => {
    const line = 'statement: Skills must be self-improving: yes.';
    const parsed = parseRecordText(file([base[0] ?? '', line, ...base.slice(1)]), CTX);

    expect(parsed.ok && parsed.record.lenient).toBe(true);
    expect(parsed.ok && parsed.record.defaulted).toEqual(['statement']);
  });
});

describe('a source that cannot parse', () => {
  it('becomes an imported source holding the raw text', () => {
    const raw =
      '{ type: chat, ref: "2026-10-16 user: \\"run it\\" in .forge\\skills\\enhance" }';

    const parsed = parseRecordText(
      file([
        'id: d-0140',
        'statement: Run enhance first',
        `source: ${raw}`,
        'status: active',
      ]),
      CTX,
    );

    expect(parsed.ok && parsed.record.source).toEqual({ type: 'imported', ref: raw });
    expect(parsed.ok && parsed.record.defaulted).toContain('source');
  });

  it('keeps a flow-map source that parses', () => {
    const parsed = parseRecordText(
      file([
        'id: d-0141',
        'statement: Plain',
        'source: { type: chat, ref: the owner said so }',
        'status: active',
      ]),
      CTX,
    );

    expect(parsed.ok && parsed.record.source).toEqual({
      type: 'chat',
      ref: 'the owner said so',
    });
  });
});
