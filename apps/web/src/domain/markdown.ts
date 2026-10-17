/**
 * Markdown subset parser: turns a Worker message into a typed node tree.
 *
 * Why: Workers write markdown (bold labels, bullets, backticked paths, fenced code) and a
 *   wall of raw asterisks is hard to read. But the text is untrusted model output, so it is
 *   never turned into HTML: this pure parser accepts only paragraphs, headings (#-###),
 *   bullet and numbered lists, fenced code, **bold**, *italic* or _italic_, `code` and
 *   http(s) links. Anything else, or syntax left open (an unmatched `**`, a `javascript:`
 *   link), stays literal text, so a half-streamed message never breaks the page.
 *
 * Exports: parseMarkdown(), parseInline().
 * Depends on: types/markdown.types. No IO.
 */

import type { MarkdownBlock, MarkdownInline } from '#/types/markdown.types.js';

const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;
const FENCE = /^\s*```/;
const HEADING = /^(#{1,3})\s+(.+)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const WORD = /[\p{L}\p{N}]/u;

function push(out: MarkdownInline[], node: MarkdownInline): void {
  const last = out[out.length - 1];

  if (node.kind === 'text' && last?.kind === 'text') {
    out[out.length - 1] = { kind: 'text', text: last.text + node.text };

    return;
  }

  out.push(node);
}

/** Index of `mark` at or after `from` where the span in between is not empty or edged by space. */
function closer(text: string, mark: string, from: number): number {
  let at = text.indexOf(mark, from);

  while (at !== -1) {
    const body = text.slice(from, at);

    if (body.length > 0 && !/^\s|\s$/.test(body)) {
      return at;
    }

    at = text.indexOf(mark, at + 1);
  }

  return -1;
}

function link(text: string, start: number): { node: MarkdownInline; end: number } | null {
  const labelEnd = text.indexOf(']', start + 1);

  if (labelEnd === -1 || text[labelEnd + 1] !== '(') {
    return null;
  }

  const urlEnd = text.indexOf(')', labelEnd + 2);

  if (urlEnd === -1) {
    return null;
  }

  const label = text.slice(start + 1, labelEnd);
  const href = text.slice(labelEnd + 2, urlEnd);

  if (label.length === 0 || !SAFE_URL.test(href)) {
    return null;
  }

  return {
    node: { kind: 'link', href, children: parseInline(label) },
    end: urlEnd + 1,
  };
}

/** Inline spans of one line or paragraph. Unmatched markers are kept as text. */
export function parseInline(text: string): readonly MarkdownInline[] {
  const out: MarkdownInline[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i] as string;

    if (ch === '`') {
      const end = text.indexOf('`', i + 1);

      if (end > i + 1) {
        push(out, { kind: 'code', text: text.slice(i + 1, end) });
        i = end + 1;

        continue;
      }
    } else if (ch === '*' && text[i + 1] === '*') {
      const end = closer(text, '**', i + 2);

      if (end !== -1) {
        push(out, { kind: 'bold', children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;

        continue;
      }
    } else if (ch === '*' || ch === '_') {
      // A leading underscore inside a word (snake_case) is not emphasis.
      const inWord = ch === '_' && i > 0 && WORD.test(text[i - 1] as string);
      const end = inWord ? -1 : closer(text, ch, i + 1);
      const afterWord = end !== -1 && ch === '_' && WORD.test(text[end + 1] ?? '');

      if (end !== -1 && !afterWord) {
        push(out, { kind: 'italic', children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;

        continue;
      }
    } else if (ch === '[') {
      const found = link(text, i);

      if (found) {
        push(out, found.node);
        i = found.end;

        continue;
      }
    }

    push(out, { kind: 'text', text: ch });
    i += 1;
  }

  return out;
}

/** Blocks of a message. Never throws; any text yields at least literal paragraphs. */
export function parseMarkdown(source: string): readonly MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let para: string[] = [];
  let i = 0;

  const flush = (): void => {
    if (para.length > 0) {
      blocks.push({ kind: 'paragraph', children: parseInline(para.join('\n')) });
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i] as string;

    if (FENCE.test(line)) {
      flush();
      const body: string[] = [];
      i += 1;

      // An unclosed fence (a message still streaming) runs to the end as code.
      while (i < lines.length && !FENCE.test(lines[i] as string)) {
        body.push(lines[i] as string);
        i += 1;
      }

      blocks.push({ kind: 'code', text: body.join('\n') });
      i += 1;

      continue;
    }

    if (line.trim() === '') {
      flush();
      i += 1;

      continue;
    }

    const heading = HEADING.exec(line);

    if (heading) {
      flush();
      blocks.push({
        kind: 'heading',
        level: (heading[1] as string).length as 1 | 2 | 3,
        children: parseInline((heading[2] as string).trim()),
      });

      i += 1;

      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const first = bullet ?? numbered;

    if (first) {
      flush();
      const pattern = bullet ? BULLET : NUMBERED;
      const items: MarkdownInline[][] = [];

      while (i < lines.length) {
        const match = pattern.exec(lines[i] as string);

        if (!match) {
          break;
        }

        items.push([...parseInline((match[1] as string).trim())]);
        i += 1;
      }

      blocks.push({ kind: 'list', ordered: numbered !== null, items });

      continue;
    }

    para.push(line);
    i += 1;
  }

  flush();

  return blocks;
}
