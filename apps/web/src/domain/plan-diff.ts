/**
 * Plan diff: what changed between a plan version and the one before it, in words.
 *
 * Why: when the owner asks for changes, the Director writes the next version; the owner must
 *   see what actually moved before approving, or "v2" is just a bigger thing to re-read. The
 *   server records the diff when it writes a version; when it did not (or this UI is looking at
 *   two versions it fetched itself) the same comparison is made here, field by field, with
 *   tickets compared by key. Values are shown as short text, never as raw JSON.
 *
 * Exports: describeValue(), diffPlans(), diffRowsOf().
 * Depends on: schemas/plan (types), types/plan.types. No IO.
 */

import type { PlanChange, PlanTicket, PlanVersion } from '#/schemas/plan.js';
import type { DiffRow } from '#/types/plan.types.js';

/** A change value as short text; null when the value is absent. */
export function describeValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.length === 0
      ? '(none)'
      : value.map((v) => describeValue(v) ?? '').join('; ');
  }

  if (typeof value === 'object') {
    const title = (value as Record<string, unknown>)['title'];

    return typeof title === 'string' ? title : JSON.stringify(value);
  }

  return String(value);
}

/** The server's recorded diff as rows. */
export function diffRowsOf(changes: readonly PlanChange[]): readonly DiffRow[] {
  return changes.map((c) => ({
    field: c.field,
    before: describeValue(c.before),
    after: describeValue(c.after),
  }));
}

const ticketLine = (t: PlanTicket): string =>
  `${t.title} (${t.priority}, ${t.lane}/${t.size}${
    t.depends_on.length > 0 ? `, after ${t.depends_on.join(', ')}` : ''
  })`;

const FIELDS: readonly (readonly [string, (p: PlanVersion) => string[] | string])[] = [
  ['Goal', (p) => p.goal],
  ['Scope', (p) => p.scope],
  ['Non-goals', (p) => p.non_goals],
  ['Assumptions', (p) => p.assumptions],
  ['Blast radius', (p) => p.verification.blast_radius],
  ['Risks', (p) => p.verification.risks],
  ['Card links', (p) => p.card_links],
];

function text(value: string[] | string): string | null {
  if (Array.isArray(value)) {
    return value.length === 0 ? null : value.join('; ');
  }

  return value === '' ? null : value;
}

/** Compares two versions field by field; tickets by key, so a reorder alone is its own row. */
export function diffPlans(before: PlanVersion, after: PlanVersion): readonly DiffRow[] {
  const rows: DiffRow[] = [];

  for (const [field, read] of FIELDS) {
    const was = text(read(before));
    const now = text(read(after));
    if (was !== now) {
      rows.push({ field, before: was, after: now });
    }
  }

  const old = new Map(before.tickets.map((t) => [t.key, t]));
  const next = new Map(after.tickets.map((t) => [t.key, t]));

  for (const [key, ticket] of next) {
    const was = old.get(key);
    if (!was || ticketLine(was) !== ticketLine(ticket)) {
      rows.push({
        field: `Ticket ${key}`,
        before: was ? ticketLine(was) : null,
        after: ticketLine(ticket),
      });
    }
  }

  for (const [key, ticket] of old) {
    if (!next.has(key)) {
      rows.push({ field: `Ticket ${key}`, before: ticketLine(ticket), after: null });
    }
  }

  const shared = (plan: PlanVersion): string =>
    plan.tickets
      .filter((t) => old.has(t.key) && next.has(t.key))
      .map((t) => t.key)
      .join(',');

  if (shared(before) !== shared(after)) {
    rows.push({
      field: 'Ticket order',
      before: before.tickets.map((t) => t.key).join(', '),
      after: after.tickets.map((t) => t.key).join(', '),
    });
  }

  return rows;
}
