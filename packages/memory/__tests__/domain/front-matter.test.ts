/**
 * Front matter parser tests — pin how a memory record file is split and parsed.
 *
 * Why: memory records are hand-edited markdown. If the parser accepted a broken file as
 *   data, a corrupted decision could silently steer the Director; if it threw on a file
 *   with a BOM or Windows line endings, one bad save would blind it to every constraint.
 *
 * Pins: CRLF, BOM, flow-mapping source, colon in statement, and every failure shape
 *   (no fences, bad YAML, non-mapping) returning a reason instead of throwing.
 * Depends on: domain/front-matter.
 */

import { describe, expect, it } from 'vitest';
import { parseFrontMatter } from '#/domain/front-matter.js';

const GOOD = `---
id: d-0001
statement: Plain statement
status: active
---
Body text
`;

describe('parseFrontMatter', () => {
  it('parses a well-formed file and ignores the body', () => {
    const r = parseFrontMatter(GOOD);
    expect(r).toEqual({
      ok: true,
      data: { id: 'd-0001', statement: 'Plain statement', status: 'active' },
    });
  });

  it('tolerates CRLF line endings', () => {
    const r = parseFrontMatter(GOOD.replace(/\n/g, '\r\n'));
    expect(r.ok && r.data).toMatchObject({ id: 'd-0001', status: 'active' });
  });

  it('tolerates a leading BOM', () => {
    const r = parseFrontMatter(`﻿${GOOD}`);
    expect(r.ok && r.data).toMatchObject({ id: 'd-0001' });
  });

  it('parses a flow-mapping source', () => {
    const r = parseFrontMatter(
      '---\nid: d-0002\nsource: { type: chat, ref: "x y" }\n---\n',
    );
    expect(r.ok && r.data).toMatchObject({ source: { type: 'chat', ref: 'x y' } });
  });

  it('keeps a statement containing a colon-space inside quotes', () => {
    const r = parseFrontMatter('---\nid: d-0003\nstatement: "Rule: do the thing"\n---\n');
    expect(r.ok && r.data).toMatchObject({ statement: 'Rule: do the thing' });
  });

  it('accepts a file whose closing fence is the last line without newline', () => {
    const r = parseFrontMatter('---\nid: d-0004\n---');
    expect(r.ok && r.data).toMatchObject({ id: 'd-0004' });
  });

  it('rejects a file without front matter', () => {
    expect(parseFrontMatter('# just markdown\n').ok).toBe(false);
  });

  it('rejects an unterminated front matter block', () => {
    expect(parseFrontMatter('---\nid: d-0005\n').ok).toBe(false);
  });

  it('rejects invalid YAML with a reason', () => {
    const r = parseFrontMatter('---\nid: [unclosed\n---\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
  });

  it('rejects front matter that is not a mapping', () => {
    expect(parseFrontMatter('---\n- a\n- b\n---\n').ok).toBe(false);
    expect(parseFrontMatter('---\n---\n').ok).toBe(false);
  });

  it('falls back to line parsing for hand-written plain scalars with colons', () => {
    const r = parseFrontMatter(
      [
        '---',
        'id: d-0006',
        'statement: `Foo` rule: do it, then "quote"',
        'source: { type: chat, ref: a, b "c" }',
        'status: active',
        '---',
      ].join('\n'),
    );
    expect(r).toEqual({
      ok: true,
      data: {
        id: 'd-0006',
        statement: '`Foo` rule: do it, then "quote"',
        status: 'active',
      },
    });
  });

  it('does not fall back when id or statement is missing or structured', () => {
    expect(parseFrontMatter('---\nid: d-0007\nnote: a: b\n---\n').ok).toBe(false);
    expect(parseFrontMatter('---\nid: [oops\nstatement: x: y\n---\n').ok).toBe(false);
  });
});
