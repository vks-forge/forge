/**
 * Pins: the markdown subset parser turns Worker text into typed nodes, keeps unsafe or
 * unbalanced syntax as literal text, and only links http(s) addresses.
 *
 * Why: Worker messages are untrusted model output. A `javascript:` link that became an
 *   anchor would be a script hole, and a stray `**` that swallowed the rest of a message
 *   would hide what the Worker said. Both must stay plain text.
 * Depends on: domain/markdown. No IO.
 */

import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from '#/domain/markdown.js';

describe('parseInline', () => {
  it('reads bold, italic and code spans', () => {
    const nodes = parseInline('**Layout:** a *b* and _c_ with `d.ts`');

    expect(nodes).toEqual([
      { kind: 'bold', children: [{ kind: 'text', text: 'Layout:' }] },
      { kind: 'text', text: ' a ' },
      { kind: 'italic', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' and ' },
      { kind: 'italic', children: [{ kind: 'text', text: 'c' }] },
      { kind: 'text', text: ' with ' },
      { kind: 'code', text: 'd.ts' },
    ]);
  });

  it('keeps unbalanced bold literal', () => {
    expect(parseInline('a **b c')).toEqual([{ kind: 'text', text: 'a **b c' }]);
  });

  it('does not treat snake_case as italic', () => {
    expect(parseInline('use my_var_name here')).toEqual([
      { kind: 'text', text: 'use my_var_name here' },
    ]);
  });

  it('links http and https only', () => {
    const ok = parseInline('[docs](https://example.com/a)');
    const bad = parseInline('[x](javascript:alert(1))');

    expect(ok).toEqual([
      {
        kind: 'link',
        href: 'https://example.com/a',
        children: [{ kind: 'text', text: 'docs' }],
      },
    ]);

    expect(bad.every((node) => node.kind === 'text')).toBe(true);
    expect(JSON.stringify(bad)).toContain('javascript:alert(1)');
  });
});

describe('parseMarkdown', () => {
  it('splits paragraphs on blank lines', () => {
    const blocks = parseMarkdown('one\n\ntwo');

    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'paragraph']);
  });

  it('reads bullet and numbered lists', () => {
    const blocks = parseMarkdown('- a\n- b\n\n1. x\n2. y');

    expect(blocks).toMatchObject([
      { kind: 'list', ordered: false, items: [[{ text: 'a' }], [{ text: 'b' }]] },
      { kind: 'list', ordered: true, items: [[{ text: 'x' }], [{ text: 'y' }]] },
    ]);
  });

  it('reads headings one to three', () => {
    const blocks = parseMarkdown('# A\n## B\n### C\n#### D');

    expect(blocks.map((b) => (b.kind === 'heading' ? b.level : b.kind))).toEqual([
      1,
      2,
      3,
      'paragraph',
    ]);
  });

  it('keeps fenced code verbatim, markers inside included', () => {
    const blocks = parseMarkdown('```ts\nconst a = **b**;\n```\nafter');

    expect(blocks).toEqual([
      { kind: 'code', text: 'const a = **b**;' },
      { kind: 'paragraph', children: [{ kind: 'text', text: 'after' }] },
    ]);
  });

  it('treats an unclosed fence as code to the end', () => {
    expect(parseMarkdown('```\nopen')).toEqual([{ kind: 'code', text: 'open' }]);
  });

  it('never throws on empty text', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});
