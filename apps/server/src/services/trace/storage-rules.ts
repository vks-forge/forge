/**
 * What each storage write means in the trace: its kind, actor, subject ids and one-line message.
 *
 * Why: the storage decorator sees only "repository X method Y with these arguments"; the owner
 *   needs "card FX-C1 moved to plan_ready" or "ticket FX-1: inbox -> planned". This table is
 *   the one place that knows which writes are worth a line, which trace kind they belong to
 *   (a chat message is `chat`, a ticket move is `transition`, a grill question is a
 *   `card_event`), and where the card, ticket and run ids sit in each call. Anything not listed
 *   is silent, except writes to the configuration-shaped repositories, which are all `config`.
 *   Run events are deliberately absent: the engine's pump logs those with the full payload.
 *
 * Exports: isWrite(), needsBefore(), describeWrite().
 * Depends on: @forge/core (TraceInput type), types/trace-storage. No IO.
 */

import type { TraceActor, TraceInput } from '@forge/core';
import type { TraceRow, TraceRule, WriteCall } from '#/types/trace-storage.types.js';

const READ_PREFIX = /^(get|list|find|count|next|latest|has|read|is)/;
const CONFIG_REPOS = new Set([
  'projects',
  'githubConnections',
  'harnesses',
  'harnessState',
  'harnessVersions',
  'harnessToolSchemas',
  'cardTypes',
]);

/** Listed writes by `repo.method`. */
const RULES: Readonly<Record<string, TraceRule>> = {
  'cards.insert': { kind: 'card', text: 'card created' },
  'cards.update': { kind: 'card', text: 'card updated' },
  'cards.updatePhase': { kind: 'card', text: 'card phase changed' },
  'cardEvents.append': { kind: 'card_event', text: 'card event' },
  'cardRelations.replaceFor': { kind: 'card', text: 'card relations replaced' },
  'cardRelations.add': { kind: 'card', text: 'card relation added' },
  'cardReplyQueue.enqueue': { kind: 'chat', text: 'chat turn queued for the Director' },
  'cardReplyQueue.claim': { kind: 'engine', text: 'chat turns claimed', level: 'debug' },
  'cardReplyQueue.complete': { kind: 'engine', text: 'chat turn done', level: 'debug' },
  'cardPlanning.update': { kind: 'card', text: 'planning state updated' },
  'cardPlanning.appendPlan': { kind: 'card', text: 'plan version saved' },
  'tickets.insert': { kind: 'ticket', text: 'ticket created' },
  'tickets.updateTicketCas': { kind: 'transition', text: 'ticket updated' },
  'ticketRelations.add': { kind: 'ticket', text: 'ticket relation added' },
  'ticketRelations.remove': { kind: 'ticket', text: 'ticket relation removed' },
  'interactions.insert': { kind: 'interaction', text: 'interaction opened' },
  'interactions.update': { kind: 'interaction', text: 'interaction updated' },
  'interactions.answer': { kind: 'interaction', text: 'interaction answered' },
  'interactions.expire': { kind: 'interaction', text: 'interaction timed out' },
  'interactions.escalate': {
    kind: 'interaction',
    text: 'interaction escalate to the owner',
  },
  'runs.insert': { kind: 'run', text: 'run row created' },
  'runs.update': { kind: 'run', text: 'run row updated' },
  'runInbox.append': { kind: 'run', text: 'steering message queued' },
  'wakeRequests.insertIfNew': { kind: 'engine', text: 'wake requested', level: 'debug' },
  'intakeEvents.insertIfNew': {
    kind: 'engine',
    text: 'intake event stored',
    level: 'debug',
  },
  'gateResults.insert': { kind: 'gate', text: 'gate result recorded' },
};

const KEY = (c: WriteCall): string => `${c.repo}.${c.method}`;

/** True when `repo.method` should leave a trace entry. */
export function isWrite(repo: string, method: string): boolean {
  if (`${repo}.${method}` in RULES) {
    return true;
  }

  return CONFIG_REPOS.has(repo) && !READ_PREFIX.test(method);
}

/** True when the entry wants the row as it was before the write (ticket CAS, interaction lookups). */
export function needsBefore(repo: string, method: string): boolean {
  return (
    `${repo}.${method}` === 'tickets.updateTicketCas' ||
    (repo === 'interactions' && method !== 'insert')
  );
}

const asTraceRow = (value: unknown): TraceRow =>
  value !== null && typeof value === 'object' ? (value as TraceRow) : {};

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

function actorOf(c: WriteCall): TraceActor {
  const event = asTraceRow(c.args[1]);
  const created = asTraceRow(asTraceRow(c.args[0])['created_by']);
  const type = str(asTraceRow(event['actor'])['type']) ?? str(created['type']);

  if (type === 'user') {
    return 'owner';
  }

  if (type === 'director') {
    return 'director';
  }

  return c.repo === 'runs' || c.repo === 'runInbox' ? 'worker' : 'engine';
}

/** The subject ids this write names, found from its arguments and the row read before it. */
function idsOf(
  c: WriteCall,
): Pick<TraceInput, 'card_id' | 'ticket_id' | 'run_id' | 'project'> {
  const first = c.args[0];
  const row = asTraceRow(first);
  const before = asTraceRow(c.before);
  const result = asTraceRow(c.result);
  // The reply queue's methods take timestamps, not ids: its subject comes from the row only.
  const named =
    typeof first === 'string' && c.repo !== 'cardReplyQueue' ? first : undefined;

  const ids: Record<string, string | undefined> = {};

  const card = str(row['card_id']) ?? str(before['card_id']);
  const ticket = str(row['ticket_id']) ?? str(before['ticket_id']);
  const run = str(row['run_id']);
  const project = str(row['project']) ?? str(before['project']) ?? str(result['project']);

  if (c.repo.startsWith('card') && c.repo !== 'cardTypes') {
    ids.card_id = named ?? str(row['id']) ?? str(row['from']) ?? card;
  } else if (card) {
    ids.card_id = card;
  }

  if (c.repo.startsWith('ticket')) {
    ids.ticket_id = named ?? str(row['id']) ?? str(row['from_id']) ?? ticket;
  } else if (ticket) {
    ids.ticket_id = ticket;
  }

  if (c.repo === 'runs' || c.repo === 'runInbox') {
    ids.run_id = named ?? str(row['id']) ?? run;
  } else if (run) {
    ids.run_id = run;
  }

  if (project) {
    ids.project = project;
  } else if (c.repo === 'projects' && named === undefined) {
    ids.project = str(row['id']);
  }

  return Object.fromEntries(
    Object.entries(ids).filter(([, v]) => v !== undefined),
  ) as Pick<TraceInput, 'card_id' | 'ticket_id' | 'run_id' | 'project'>;
}

function messageOf(c: WriteCall, rule: TraceRule): string {
  const subject = idsOf(c);
  const where =
    (c.repo.startsWith('ticket') || c.repo === 'interactions'
      ? subject.ticket_id
      : c.repo === 'runs' || c.repo === 'runInbox'
        ? subject.run_id
        : undefined) ??
    subject.card_id ??
    subject.ticket_id ??
    subject.run_id ??
    '';

  const patch = asTraceRow(c.args[2]);
  const before = asTraceRow(c.before);

  switch (KEY(c)) {
    case 'cardEvents.append':
      return `card ${where} event ${str(asTraceRow(c.args[1])['kind']) ?? ''}`.trim();
    case 'cards.updatePhase':
      return `card ${where} phase -> ${str(patch['phase']) ?? ''}`.trim();
    case 'tickets.updateTicketCas': {
      const to = str(patch['status']);
      const from = str(before['status']);

      if (!to) {
        return `ticket ${where} updated`;
      }

      const lost = c.result === false ? ' (lost the race)' : '';

      return to === from
        ? `ticket ${where} updated, still ${to}${lost}`
        : `ticket ${where}: ${from ?? '?'} -> ${to}${lost}`;
    }

    default:
      return `${rule.text}${where ? ` ${where}` : ''}`;
  }
}

function dataOf(c: WriteCall): unknown {
  switch (KEY(c)) {
    case 'tickets.updateTicketCas':
      return {
        expectedVersion: c.args[1],
        patch: c.args[2],
        before: c.before,
        applied: c.result,
      };
    case 'cardEvents.append':
      return { event: c.args[1], stored: c.result };
    case 'cards.updatePhase':
      return { expectedVersion: c.args[1], update: c.args[2], applied: c.result };
    default:
      return {
        args: c.args,
        result: c.result,
        ...(c.before ? { before: c.before } : {}),
      };
  }
}

/** The entry for one committed write, or null when it is not worth a line. */
export function describeWrite(c: WriteCall): TraceInput | null {
  // An idle claim is a poll, not a decision: never one line per quiet tick.
  if (
    KEY(c) === 'cardReplyQueue.claim' &&
    Array.isArray(c.result) &&
    c.result.length === 0
  ) {
    return null;
  }

  if (c.repo === 'cardEvents' && c.method === 'append') {
    const kind = str(asTraceRow(c.args[1])['kind']);
    const chat = kind === 'user_message' || kind === 'director_message';

    return {
      level: 'info',
      kind: chat ? 'chat' : 'card_event',
      ...idsOf(c),
      actor: actorOf(c),
      message: messageOf(c, { kind: 'card_event', text: '' }),
      data: dataOf(c),
    };
  }

  const rule =
    RULES[KEY(c)] ??
    (CONFIG_REPOS.has(c.repo)
      ? { kind: 'config' as const, text: `${c.repo}.${c.method}` }
      : undefined);

  if (!rule) {
    return null;
  }

  return {
    level: rule.level ?? 'info',
    kind: CONFIG_REPOS.has(c.repo) ? 'config' : rule.kind,
    ...idsOf(c),
    actor: actorOf(c),
    message: messageOf(c, rule),
    data: dataOf(c),
  };
}
