/**
 * Memory API query schemas — what the search and access-log routes accept in the URL.
 *
 * Why: the memory search is the first thing a browser sends that reaches the full-text index, so the query
 *   string is validated before anything uses it: the text is 1 to 200 characters, the kinds and statuses are
 *   the known words, tags are the allowed tag words (at most eight), the page size and offset are bounded,
 *   and nothing else is read. `superseded=1` is the one switch for showing replaced decisions. A bad value
 *   answers 400 with the issues listed, never a search on a guess.
 *
 * Exports: MemorySearchParams, AccessLogParams.
 * Depends on: @forge/core, zod. No IO.
 */

import { MemoryKind, MemoryStatus, MemoryTag } from '@forge/core';
import { z } from 'zod';

/** Values repeated (`tag=a&tag=b`) or comma separated (`tag=a,b`) both read as a list. */
const list = (raw: readonly string[]): string[] =>
  raw
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v !== '');

/** Builds the object the schema parses from the raw query string. */
export function searchParamsOf(url: URL): Record<string, unknown> {
  const q = url.searchParams;

  return {
    q: q.get('q') ?? undefined,
    kind: list(q.getAll('kind')),
    status: list(q.getAll('status')),
    tag: list(q.getAll('tag')),
    k: q.get('k') ?? undefined,
    offset: q.get('offset') ?? undefined,
    superseded: q.get('superseded') ?? undefined,
  };
}

export const MemorySearchParams = z
  .object({
    q: z.string().trim().min(1).max(200),
    kind: z.array(MemoryKind).default([]),
    status: z.array(MemoryStatus).default([]),
    tag: z.array(MemoryTag).max(8).default([]),
    k: z.coerce.number().int().min(1).max(25).default(10),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
    superseded: z.literal('1').optional(),
  })
  .strict();

export type MemorySearchParams = z.infer<typeof MemorySearchParams>;

export const AccessLogParams = z
  .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
  .strict();

export type AccessLogParams = z.infer<typeof AccessLogParams>;
