/**
 * Suggested project slug and ticket prefix from a folder name.
 *
 * Why: the new-project form pre-fills both so the common case is one click, but they must be
 *   valid (a slug is a lower-case URL segment, a prefix is 1-10 upper-case characters that
 *   start ticket ids like `FG-12`) and must not collide with a project already registered,
 *   or the save would be refused. Doing it as a pure function means the server's suggestion
 *   and the rule it must satisfy (`PROJECT_PREFIX_PATTERN`) are tested together.
 *
 * Exports: suggestSlug(), suggestPrefix().
 * Depends on: schemas/ids (PROJECT_PREFIX_PATTERN). No IO.
 */

import { PROJECT_PREFIX_PATTERN } from '#/schemas/ids.js';

const SLUG_FALLBACK = 'project';
const PREFIX_FALLBACK = 'PRJ';

/** A free slug from a folder name: lower-case words joined by `-`, `-2`, `-3` when taken. */
export function suggestSlug(folderName: string, taken: ReadonlySet<string>): string {
  const words = folderName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // A slug starts with a letter.
  const base = /^[a-z]/.test(words)
    ? words.slice(0, 40).replace(/-+$/, '')
    : SLUG_FALLBACK;

  let slug = base;
  for (let n = 2; taken.has(slug); n += 1) {
    slug = `${base}-${n}`;
  }

  return slug;
}

/** A free ticket prefix from a slug: initials of its words, else its first letters; numbered when taken. */
export function suggestPrefix(slug: string, taken: ReadonlySet<string>): string {
  const parts = slug.split('-').filter((p) => /^[a-z]/.test(p));
  const initials = parts.map((p) => p[0] ?? '').join('');
  const raw = (parts.length > 1 ? initials : (parts[0] ?? '').slice(0, 3)).toUpperCase();
  const base = PROJECT_PREFIX_PATTERN.test(raw.slice(0, 8))
    ? raw.slice(0, 8)
    : PREFIX_FALLBACK;

  let prefix = base;
  for (let n = 2; taken.has(prefix); n += 1) {
    prefix = `${base}${n}`;
  }

  return prefix;
}
