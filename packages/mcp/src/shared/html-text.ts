/**
 * Minimal, linear-time HTML to text extraction.
 *
 * Why: `web_fetch` hands pages to a model, so it needs readable text without script,
 *   style or head content. Pages are hostile and up to 2 MB, so this is a single-pass
 *   scanner (no backtracking regexes): every `indexOf` moves forward only, so a page of
 *   endless unclosed tags cannot stall the server.
 *
 * Exports: htmlToText().
 * Depends on: No IO.
 */

const DROP = new Set(['script', 'style', 'noscript', 'head', 'template', 'svg']);
const BREAK = new Set([
  'p',
  'div',
  'br',
  'li',
  'tr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'section',
  'article',
  'header',
  'footer',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'table',
]);
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (m, e: string) => {
    if (e.startsWith('#')) {
      const code =
        e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Strips tags and non-visible blocks, keeps block breaks, decodes common entities. */
export function htmlToText(html: string): string {
  // ASCII-only: toLowerCase() can change string length for some Unicode, shifting offsets.
  const lower = html.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
  let out = '';
  let pos = 0;
  while (pos < html.length) {
    const lt = html.indexOf('<', pos);
    if (lt === -1) {
      out += html.slice(pos);
      break;
    }
    out += html.slice(pos, lt);
    const gt = html.indexOf('>', lt + 1);
    if (gt === -1) {
      out += html.slice(lt);
      break;
    }
    const m = /^<\/?([a-z][a-z0-9]*)/.exec(lower.slice(lt, Math.min(gt, lt + 40)));
    const name = m?.[1];
    if (!name) {
      // `<` not starting a tag (e.g. "a < b" or a comment): keep it as text.
      out += '<';
      pos = lt + 1;
      continue;
    }
    pos = gt + 1;
    if (DROP.has(name) && lower[lt + 1] !== '/') {
      const close = lower.indexOf(`</${name}`, pos);
      if (close === -1) break;
      const closeGt = html.indexOf('>', close);
      pos = closeGt === -1 ? html.length : closeGt + 1;
    }
    if (BREAK.has(name)) out += '\n';
  }
  return decodeEntities(out)
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
