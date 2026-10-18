/**
 * Pins the minimal HTML-to-text extractor used by web fetches.
 *
 * Why: fetched pages are untrusted and up to 2 MB. The Worker must see readable text
 *   without scripts or styles smuggling instructions or bloating context, and hostile
 *   markup (thousands of unclosed tags) must not make extraction slow.
 *
 * Pins: htmlToText(), htmlTitle().
 * Depends on: shared/html-text.
 */

import { describe, expect, it } from 'vitest';
import { htmlTitle, htmlToText } from '#/shared/html-text.js';

describe('htmlToText', () => {
  it('drops script, style and head, keeps visible text with block breaks', () => {
    const html =
      '<html><head><title>T</title><style>p{}</style></head><body><h1>Hi &amp; bye</h1><script>alert(1)</script><p>one</p><p>two&nbsp;&#33;</p></body></html>';

    const text = htmlToText(html);
    expect(text).toContain('Hi & bye');
    expect(text).toContain('one\n');
    expect(text).toContain('two !');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('p{}');
    expect(text).not.toContain('<');
  });

  it('drops everything after an unclosed script tag', () => {
    expect(htmlToText('before<script>never closed after')).toBe('before');
  });

  it('is linear on hostile input (many unclosed tags)', () => {
    const hostile = '<script'.repeat(200_000);
    const start = Date.now();
    htmlToText(hostile);
    expect(Date.now() - start).toBeLessThan(2_000);
  });

  it('treats a lone < as text', () => {
    expect(htmlToText('a < b')).toBe('a < b');
  });
});

describe('htmlTitle', () => {
  it('reads the title, decodes entities and collapses whitespace', () => {
    const html = '<head><TITLE>\n Widget &amp;  API </TITLE></head><body>x</body>';

    expect(htmlTitle(html)).toBe('Widget & API');
  });

  it('is empty without a title and caps a long one', () => {
    expect(htmlTitle('<p>no title</p>')).toBe('');
    expect(htmlTitle(`<title>${'a'.repeat(1000)}</title>`)).toHaveLength(300);
  });

  it('is empty for an unclosed title', () => {
    expect(htmlTitle('<title>never closed')).toBe('');
  });
});
