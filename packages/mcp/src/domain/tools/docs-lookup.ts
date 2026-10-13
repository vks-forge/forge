/**
 * Tool `docs_lookup` — read project markdown docs by path or glob, offline.
 *
 * Why: a Worker should consult the project's own design notes before guessing, and that
 *   must not need the network or a general file reader. The tool serves only markdown
 *   under the directories the operator configured, resolves symlinks before checking
 *   containment (a link inside docs/ cannot lead out), and caps the bytes returned so
 *   one large doc cannot flood the Worker's context. Glob patterns are collapsed and capped
 *   (at most 8 wildcards, bounded walk) so a hostile pattern cannot burn the server's CPU.
 *
 * Exports: docsLookupTool, DEFAULT_DOCS_MAX_BYTES.
 * Depends on: @forge/core (globMatch), node:fs/promises, node:path, shared/define-tool. IO: filesystem reads.
 */

import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { InvalidInputError, PolicyDeniedError, globMatch } from '@forge/core';
import { DocsLookupInput } from '#/schemas/tool-inputs.js';
import { defineTool } from '#/shared/define-tool.js';

export const DEFAULT_DOCS_MAX_BYTES = 64 * 1024;
const MARKDOWN = /\.(md|markdown|mdx)$/i;
const MAX_LISTED = 100;
const MAX_WALKED = 5_000;
const MAX_DEPTH = 8;
const MAX_WILDCARDS = 8;

function inside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

async function walk(root: string): Promise<string[]> {
  const found: string[] = [];
  const visit = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || found.length >= MAX_WALKED) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (found.length >= MAX_WALKED) return;
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full, depth + 1);
      else if (entry.isFile() && MARKDOWN.test(entry.name))
        found.push(relative(root, full));
    }
  };
  await visit(root, 0);
  return found.map((f) => f.split(sep).join('/'));
}

/** Collapses redundant wildcard runs, then refuses patterns with too many wildcards. */
function safePattern(pattern: string): string {
  const collapsed = pattern
    .replace(/\*{3,}/g, '**')
    .replace(/(?:\*\*\/)+/g, '**/')
    .replace(/\*\*(?!\/|$)/g, '*');
  if ((collapsed.match(/[*?]/g) ?? []).length > MAX_WILDCARDS)
    throw new InvalidInputError(`pattern has more than ${MAX_WILDCARDS} wildcards`);
  return collapsed;
}

async function list(roots: readonly string[], rawPattern: string): Promise<string> {
  const pattern = safePattern(rawPattern);
  const hits: { root: string; rel: string }[] = [];
  for (const root of roots) {
    for (const rel of await walk(root))
      if (globMatch(pattern, rel)) hits.push({ root, rel });
  }
  if (hits.length === 0) throw new InvalidInputError(`no markdown docs match ${pattern}`);
  const shown = await Promise.all(
    hits.slice(0, MAX_LISTED).map(async ({ root, rel }) => {
      const size = (await stat(join(root, rel))).size;
      return `${rel} (${size} bytes)`;
    }),
  );
  const more =
    hits.length > shown.length ? `\n... ${hits.length - shown.length} more` : '';
  return `${shown.join('\n')}${more}`;
}

async function read(
  roots: readonly string[],
  path: string,
  cap: number,
): Promise<string> {
  if (!MARKDOWN.test(path)) throw new PolicyDeniedError('only markdown docs can be read');
  if (isAbsolute(path)) throw new PolicyDeniedError('docs paths must be relative');
  for (const root of roots) {
    const candidate = resolve(root, path);
    if (!inside(root, candidate)) continue;
    let real: string;
    let realRoot: string;
    try {
      real = await realpath(candidate);
      realRoot = await realpath(root);
    } catch {
      continue;
    }
    if (!inside(realRoot, real))
      throw new PolicyDeniedError('path escapes the docs directory');
    const buf = await readFile(real);
    if (buf.length <= cap) return buf.toString('utf8');
    return `${buf.subarray(0, cap).toString('utf8')}\n[truncated: showing ${cap} of ${buf.length} bytes]`;
  }
  throw new InvalidInputError(`no such doc: ${path}`);
}

export const docsLookupTool = defineTool({
  name: 'docs_lookup',
  description:
    'Read a project markdown doc by relative path (e.g. design/tool-system.md), or list docs with a glob (e.g. design/*.md). Output is capped; pass max_bytes to ask for less.',
  risk: 'read',
  inputSchema: DocsLookupInput,
  async handler(ctx, { path, max_bytes }) {
    const roots = ctx.deps.docsDirs ?? [];
    if (roots.length === 0)
      throw new InvalidInputError('docs_lookup is not configured (no docs directories)');
    const ceiling = ctx.deps.docsMaxBytes ?? DEFAULT_DOCS_MAX_BYTES;
    const cap = Math.min(max_bytes ?? ceiling, ceiling);
    const normalized = path.replaceAll('\\', '/');
    if (/[*?]/.test(normalized)) {
      if (normalized.split('/').includes('..'))
        throw new PolicyDeniedError('path escapes the docs directory');
      return list(roots, normalized);
    }
    if (normalized.split('/').includes('..'))
      throw new PolicyDeniedError('path escapes the docs directory');
    return read(roots, normalized, cap);
  },
});
