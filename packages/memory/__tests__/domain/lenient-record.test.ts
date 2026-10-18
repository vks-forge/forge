/**
 * Pins how an old memory record file becomes a record without losing a word, even when its YAML is invalid.
 *
 * Why: about a fifth of this project's own records have a header that strict YAML rejects (an unquoted colon
 *   in the statement, a leading backtick, a flow-map source with quotes inside), and a hand-written `#`
 *   silently cuts a statement short. Moving memory into the database must not drop any of them, or a decision
 *   the owner made disappears from what the Director plans against. The parser keeps the statement byte for
 *   byte, keeps every field that parses, fills what is missing with the safe value (never an owner decision
 *   or `active` that was not written) and says which fields it filled, so the owner can see it and nothing
 *   is believed more than the file said.
 *
 * Pins: a clean file is not flagged, defaults and kind from the folder, rejected approaches in force, outcomes without an id or a header, tags normalised,
 *   links from the header and the body, and the two real rejects (no id, no statement).
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

describe('a clean file', () => {
  const clean = file(
    [
      'id: d-0010',
      'kind: decision',
      'statement: Use zod',
      'source: { type: chat, ref: owner }',
      'author: user',
      'origin: owner',
      'status: active',
      'valid_from: 2026-10-12',
      'confidence: 0.7',
      'tags: [a-b, c.d]',
      'amends: d-0002',
      'reopens: [d-0003, d-0004]',
    ],
    'See d-0007 and d-0010 for why; r-0001 too.',
  );

  it('is not flagged and keeps its links, body citations excluded of itself', () => {
    const parsed = parseRecordText(clean, CTX);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const r = parsed.record;
    expect(r).toMatchObject({
      lenient: false,
      defaulted: [],
      raw_front_matter: null,
      confidence: 0.7,
    });

    expect(r.links).toEqual(
      expect.arrayContaining([
        { rel: 'amends', target_kind: 'record', target: 'd-0002' },
        { rel: 'reopens', target_kind: 'record', target: 'd-0003' },
        { rel: 'reopens', target_kind: 'record', target: 'd-0004' },
        { rel: 'cites', target_kind: 'record', target: 'd-0007' },
        { rel: 'cites', target_kind: 'record', target: 'r-0001' },
      ]),
    );

    expect(r.links.some((l) => l.target === 'd-0010')).toBe(false);
  });

  it('keeps unknown header keys in the raw header', () => {
    const parsed = parseRecordText(
      file(['id: d-0011', 'statement: S', 'status: active', 'approved_source: chat']),
      CTX,
    );

    expect(parsed.ok && parsed.record.raw_front_matter).toContain(
      'approved_source: chat',
    );
  });
});

describe('defaults are safe, never a promotion', () => {
  it('takes kind from the folder, author director, origin agent, the import date, and status pending when none is written', () => {
    const parsed = parseRecordText(file(['id: d-0020', 'statement: Written by hand']), {
      ...CTX,
      folder: 'decisions',
    });

    expect(parsed.ok && parsed.record).toMatchObject({
      kind: 'decision',
      status: 'pending',
      author: 'director',
      origin: 'agent',
      valid_from: '2026-10-18',
      source: { type: 'imported', ref: 'no source recorded' },
      pinned: false,
      tags: [],
      confidence: null,
    });

    expect(parsed.ok && parsed.record.defaulted).toEqual(
      expect.arrayContaining(['status', 'author', 'origin', 'valid_from', 'source']),
    );
  });

  it('maps the old kind word proposed by folder and keeps the status that was written', () => {
    const approved = parseRecordText(
      file(['id: x-0010', 'kind: proposed', 'statement: S', 'status: active']),
      { ...CTX, folder: 'decisions' },
    );

    const pending = parseRecordText(
      file(['id: x-0011', 'kind: proposed', 'statement: S', 'status: superseded']),
      { ...CTX, folder: 'proposed', relPath: 'proposed/x-0011.md' },
    );

    expect(approved.ok && approved.record).toMatchObject({
      kind: 'decision',
      status: 'active',
    });

    expect(approved.ok && approved.record.defaulted).toContain('kind');
    expect(pending.ok && pending.record).toMatchObject({
      kind: 'proposal',
      status: 'superseded',
    });
  });

  it('keeps a rejected approach in force whether it says active or rejected, without flagging the status', () => {
    for (const status of ['active', 'rejected']) {
      const parsed = parseRecordText(
        file([
          'id: r-0001',
          'kind: rejected',
          'statement: No vectors',
          `status: ${status}`,
          'author: user',
          'origin: owner',
          'source: { type: chat, ref: o }',
          'valid_from: 2026-10-12',
        ]),
        { ...CTX, folder: 'rejected', relPath: 'rejected/r-0001.md' },
      );

      expect(parsed.ok && parsed.record).toMatchObject({
        kind: 'rejected',
        status: 'rejected',
      });

      expect(parsed.ok && parsed.record.defaulted).toEqual([]);
    }
  });

  it('drops a confidence outside 0..1 and normalises tags to the allowed words', () => {
    const parsed = parseRecordText(
      file([
        'id: d-0030',
        'statement: S',
        'status: active',
        'confidence: 1.5',
        'tags: [Quality, "has space", UPPER_case, "a/b", ""]',
      ]),
      CTX,
    );

    expect(parsed.ok && parsed.record.confidence).toBeNull();
    expect(parsed.ok && parsed.record.tags).toEqual([
      'quality',
      'has-space',
      'upper_case',
      'a-b',
    ]);

    expect(parsed.ok && parsed.record.defaulted).toContain('confidence');
  });

  it('reads tags that do not parse as none and says so', () => {
    const parsed = parseRecordText(
      file(['id: d-0031', 'statement: S', 'status: active', 'tags: [a, b: c: d']),
      CTX,
    );

    expect(parsed.ok && parsed.record.tags).toEqual([]);
    expect(parsed.ok && parsed.record.defaulted).toContain('tags');
  });
});

describe('outcomes', () => {
  const OUT: ParseContext = {
    folder: 'outcomes',
    relPath: 'outcomes/2026-10/2026-10-12-design-session.md',
    importedAt: '2026-10-18',
  };

  it('gets no id of its own, a statement from the session or the first line, and the date from the file', () => {
    const withHeader = parseRecordText(
      `---\nkind: outcome\ndate: 2026-10-12\nsession: hyperresearch run\nauthor: system\norigin: system\n---\n- Ran the pipeline.\n`,
      OUT,
    );

    const bare = parseRecordText('# Session notes\n\n- did things\n', OUT);

    expect(withHeader.ok && withHeader.record).toMatchObject({
      id: null,
      kind: 'outcome',
      statement: 'hyperresearch run',
      valid_from: '2026-10-12',
      origin: 'system',
      author: 'director',
      status: 'active',
      body: '- Ran the pipeline.',
    });

    expect(bare.ok && bare.record).toMatchObject({
      id: null,
      kind: 'outcome',
      statement: 'Session notes',
      valid_from: '2026-10-12',
      origin: 'system',
    });

    expect(bare.ok && bare.record.defaulted).toEqual(
      expect.arrayContaining(['id', 'statement']),
    );
  });

  it('keeps the id and statement a writer-made outcome carries', () => {
    const parsed = parseRecordText(
      file([
        'id: o-0004',
        'kind: outcome',
        'statement: Did the thing',
        'status: active',
        'author: director',
        'origin: system',
        'valid_from: 2026-10-15T10:00:00.000Z',
        'source: { type: system, ref: director outcome }',
      ]),
      OUT,
    );

    expect(parsed.ok && parsed.record).toMatchObject({
      id: 'o-0004',
      statement: 'Did the thing',
    });
  });
});

describe('rejects', () => {
  it('refuses a decision with no id, a bad id or no statement, and a file with no header', () => {
    expect(parseRecordText(file(['statement: S', 'status: active']), CTX)).toEqual({
      ok: false,
      reason: 'no id',
    });

    expect(parseRecordText(file(['id: D1', 'statement: S']), CTX)).toEqual({
      ok: false,
      reason: 'id D1 does not look like d-0001',
    });

    expect(parseRecordText(file(['id: d-0001', 'status: active']), CTX)).toEqual({
      ok: false,
      reason: 'no statement',
    });

    expect(parseRecordText('just text\n', CTX)).toEqual({
      ok: false,
      reason: 'no front matter',
    });

    expect(parseRecordText('---\nid: d-0001\n', CTX)).toEqual({
      ok: false,
      reason: 'unterminated front matter',
    });
  });
});
