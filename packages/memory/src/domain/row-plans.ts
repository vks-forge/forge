/**
 * Row plans — what each Director write stores in the database, as pure functions.
 *
 * Why: every write has the same duties as it had when memory was files: stamp `author` and `status` itself
 *   (never take them from the caller, so an inference cannot pass as an owner decision), cap the Director's
 *   confidence, keep the words as given, and write one history entry that says who did what. Planning without
 *   touching storage keeps those rules testable; the one door that stores the plan only adds ordering and the
 *   transaction. Typed links (amends, reopens, cites, card, ticket) and the search aids (gist, aliases) ride
 *   on the row as the caller gave them.
 *
 * Exports: planProposal(), planDecision(), planOutcome(), linksFromInput(), firstLineStatement().
 * Depends on: @forge/core, types/sql-memory. Pure, no IO.
 */

import { DecisionInput, InvalidInputError, ProposalInput } from '@forge/core';
import type { MemoryInputLinks, MemoryLink, MemoryRow } from '@forge/core';
import type { RowWrite } from '#/types/sql-memory.types.js';

const OUTCOME_STATEMENT_MAX = 200;

/** The typed links a writer may give, as link rows. */
export function linksFromInput(links: MemoryInputLinks | undefined): MemoryLink[] {
  const out: MemoryLink[] = [];
  for (const rel of ['amends', 'reopens', 'cites'] as const) {
    for (const target of links?.[rel] ?? []) {
      out.push({ rel, target_kind: 'record', target });
    }
  }

  if (links?.card !== undefined) {
    out.push({ rel: 'card', target_kind: 'card', target: links.card });
  }

  if (links?.ticket !== undefined) {
    out.push({ rel: 'ticket', target_kind: 'ticket', target: links.ticket });
  }

  return out;
}

const blank = (project: string, id: string, at: string): MemoryRow => ({
  project,
  id,
  kind: 'decision',
  status: 'active',
  statement: '',
  body: '',
  source_type: '',
  source_ref: '',
  author: 'user',
  origin: 'owner',
  confidence: null,
  created_at: at,
  valid_from: at,
  valid_to: null,
  superseded_by: null,
  pinned: false,
  approved_at: null,
  approved_by: null,
  rejected_at: null,
  rejected_by: null,
  rejected_reason: null,
  gist: null,
  aliases: [],
  imported_from: null,
  raw_front_matter: null,
  lenient_fields: null,
});

/** A pending proposal by the Director; `raw` is validated here, so the caller cannot set author or status. */
export function planProposal(
  project: string,
  id: string,
  at: string,
  raw: unknown,
): RowWrite {
  const input = ProposalInput.parse(raw);

  return {
    row: {
      ...blank(project, id, at),
      kind: 'proposal',
      status: 'pending',
      statement: input.statement,
      body: (input.body ?? '').trim(),
      source_type: input.source.type,
      source_ref: input.source.ref,
      author: 'director',
      origin: input.origin ?? 'agent',
      confidence: input.confidence ?? null,
      gist: input.gist ?? null,
      aliases: input.aliases ?? [],
    },
    tags: input.tags ?? [],
    links: linksFromInput(input.links),
    event: {
      at,
      actor: 'director',
      event: 'proposed',
      from_status: null,
      to_status: 'pending',
      reason: null,
    },
  };
}

/** An active decision by the owner, pinned unless the owner says otherwise; `supersedes` adds that edge. */
export function planDecision(
  project: string,
  id: string,
  at: string,
  raw: unknown,
  supersedes: string | null = null,
): RowWrite {
  const input = DecisionInput.parse(raw);
  const links = linksFromInput(input.links);
  if (supersedes !== null) {
    links.unshift({ rel: 'supersedes', target_kind: 'record', target: supersedes });
  }

  return {
    row: {
      ...blank(project, id, at),
      statement: input.statement,
      body: (input.body ?? '').trim(),
      source_type: input.source.type,
      source_ref: input.source.ref,
      origin: input.origin ?? 'owner',
      pinned: input.pinned ?? true,
      gist: input.gist ?? null,
      aliases: input.aliases ?? [],
    },
    tags: input.tags ?? [],
    links,
    event: {
      at,
      actor: 'user',
      event: 'decided',
      from_status: null,
      to_status: 'active',
      reason: supersedes === null ? null : `supersedes ${supersedes}`,
    },
  };
}

/** The first line of a note, whitespace collapsed and cut, used as the statement of an outcome. */
export function firstLineStatement(text: string): string {
  const flat = (text.split('\n')[0] ?? text).replace(/\s+/g, ' ').trim();

  return flat.length > OUTCOME_STATEMENT_MAX
    ? `${flat.slice(0, OUTCOME_STATEMENT_MAX - 1)}…`
    : flat;
}

/** An outcome note: the first line is its statement, the whole text its body. */
export function planOutcome(
  project: string,
  id: string,
  at: string,
  text: string,
): RowWrite {
  const body = text.trim();
  if (body === '') {
    throw new InvalidInputError('an outcome needs text');
  }

  return {
    row: {
      ...blank(project, id, at),
      kind: 'outcome',
      statement: firstLineStatement(body),
      body,
      source_type: 'system',
      source_ref: 'director outcome',
      author: 'director',
      origin: 'system',
    },
    tags: [],
    links: [],
    event: {
      at,
      actor: 'director',
      event: 'decided',
      from_status: null,
      to_status: 'active',
      reason: null,
    },
  };
}
