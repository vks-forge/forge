/**
 * Derives a project's inbox items from the rows that need or inform the owner.
 *
 * Why: the Inbox must never disagree with the board, so nothing is copied into an inbox
 *   table: each item is read from its source on every request. A Worker's open question, a
 *   ticket waiting for review or sign-off, a failed gate, an interrupted run, a harness out of
 *   quota, a harness build or tool awaiting a decision and a memory proposal each become one
 *   item whose `updated_at` is the source's own change time, which is what lets a mark expire
 *   when the source moves (d-0116). Finished work waiting for a name is listed once, through its
 *   sign-off item, and falls back to a plain review item only when it has none. Items that wait on a decision are `needs_action`; the
 *   rest inform. Harness-level items (compat, tool approvals) block every project, so they
 *   show in each, but only for the current build of each harness (the installed one, else the
 *   newest checked): an older build can no longer be acted on and would nag forever. A tool
 *   approval is dated by when Forge checked its build. Quota waits show only where open work
 *   is affected. Memory proposals carry no timestamp, so they use the epoch and sort last
 *   (the web shows no date for an epoch item). Tickets of a closed card never show: their work was
 *   cancelled with the card.
 *
 * Exports: gatherInboxCandidates().
 * Depends on: @forge/core (inbox rules, StorageTx, memory entries), services/collect-pages,
 *   services/current-harness-build, services/escalation-view.
 *   IO: reads storage.
 */

import { TERMINAL_STATUSES, inboxItemId } from '@forge/core';
import type {
  EscalationView,
  GateResult,
  InboxCandidate,
  MemoryListEntry,
  Project,
  StorageTx,
  Ticket,
} from '@forge/core';
import { collectRuns, collectTickets } from '#/services/collect-pages.js';
import { currentHarnessBuilds } from '#/services/current-harness-build.js';
import { escalationViews } from '#/services/escalation-view.js';

const EPOCH = '1970-01-01T00:00:00.000Z';
const clip = (text: string, max = 140): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** The line an escalation shows in the Inbox: the question, or what went wrong. */
function titleOf(view: EscalationView): string {
  const text =
    view.payload.kind === 'question' ? view.payload.text : view.payload.summary;

  return clip(text.replace(/\s+/g, ' ').trim());
}

const ticketItems = (
  tickets: readonly Ticket[],
  pending: ReadonlySet<string>,
  signOffs: ReadonlySet<string>,
  project: string,
) =>
  tickets.flatMap((t): InboxCandidate[] => {
    const base = { project, ticket_id: t.id, updated_at: t.updated_at };
    // Finished work waiting for a name is already listed through its sign-off item: one item, not two.
    if ((t.status === 'review' || t.status === 'needs_signoff') && signOffs.has(t.id)) {
      return [];
    }

    if (t.status === 'review') {
      return [
        {
          ...base,
          id: inboxItemId('ticket_review', t.id),
          kind: 'ticket_review',
          title: `Review: ${t.title}`,
          needs_action: true,
        },
      ];
    }

    if (t.status === 'needs_signoff') {
      return [
        {
          ...base,
          id: inboxItemId('ticket_signoff', t.id),
          kind: 'ticket_signoff',
          title: `Sign-off needed: ${t.title}`,
          needs_action: true,
        },
      ];
    }

    // A parked ticket with an open question is shown through the question itself.
    return t.status === 'waiting_human' && !pending.has(t.id)
      ? [
          {
            ...base,
            id: inboxItemId('ticket_waiting', t.id),
            kind: 'ticket_waiting',
            title: `Waiting on you: ${t.title}`,
            ...(t.blocked_reason === undefined ? {} : { detail: clip(t.blocked_reason) }),
            needs_action: true,
          },
        ]
      : [];
  });

/**
 * Every item of `project` right now, unsorted and without read/archive marks.
 * `proposals` are the project's memory entries (read by the caller, outside the transaction).
 * `installedVersion` is the compat service's installed build of a harness kind, if known.
 */
export async function gatherInboxCandidates(
  tx: StorageTx,
  project: Project,
  proposals: readonly MemoryListEntry[],
  nowMs: number,
  installedVersion: (kind: string) => string | null,
): Promise<InboxCandidate[]> {
  const slug = project.slug;
  const nowIso = new Date(nowMs).toISOString();
  // The work of a closed card is dropped: nothing about it asks the owner anything.
  const everyTicket = await collectTickets(tx, project.id);
  const closedCards = new Set<string>();
  for (const id of new Set(everyTicket.flatMap((t) => (t.card_id ? [t.card_id] : [])))) {
    const card = await tx.cards.get(id);
    if (card && (card.closed_reason !== undefined || card.phase === 'closed')) {
      closedCards.add(id);
    }
  }

  const tickets = everyTicket.filter((t) => !t.card_id || !closedCards.has(t.card_id));
  const byId = new Map(tickets.map((t) => [t.id as string, t]));
  const items: InboxCandidate[] = [];

  // Every pending wait explains its ticket; only the ones already with the owner are listed
  // (a wait the Director is still looking at stays out of the Inbox).
  const pending = new Set<string>();
  const mine = (await tx.interactions.listPending()).filter((i) => byId.has(i.ticket_id));
  const views = new Map(
    (
      await escalationViews(
        tx,
        mine.filter((i) => i.escalated_at !== undefined),
      )
    ).map((v) => [v.id, v]),
  );

  for (const i of mine) {
    const ticket = byId.get(i.ticket_id) as Ticket;
    const view = views.get(i.id);
    pending.add(i.ticket_id);
    if (!view) {
      continue;
    }

    items.push({
      id: inboxItemId('question', i.id),
      kind: 'question',
      project: slug,
      title: titleOf(view),
      detail: ticket.title,
      ticket_id: ticket.id,
      ...(i.run_id === undefined ? {} : { run_id: i.run_id }),
      escalation: view,
      needs_action: true,
      updated_at: i.escalated_at ?? i.asked_at,
    });
  }

  const signOffs = new Set(
    mine
      .filter((i) => i.kind === 'sign_off' && i.escalated_at !== undefined)
      .map((i) => i.ticket_id),
  );

  items.push(...ticketItems(tickets, pending, signOffs, slug));

  const open = tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status));
  for (const t of open) {
    const latest = new Map<string, GateResult>();
    for (const g of await tx.gateResults.listByTicket(t.id)) {
      latest.set(g.gate, g);
    }

    for (const g of latest.values()) {
      if (g.status === 'failed' || g.status === 'error') {
        items.push({
          id: inboxItemId('gate_failed', String(g.id)),
          kind: 'gate_failed',
          project: slug,
          title: `Gate ${g.gate} ${g.status === 'error' ? 'errored' : 'failed'}: ${t.title}`,
          ticket_id: t.id,
          run_id: g.run_id,
          needs_action: false,
          updated_at: g.ended_at ?? g.started_at,
        });
      }
    }
  }

  for (const r of await collectRuns(tx, {
    project: project.id,
    statuses: ['interrupted'],
  })) {
    items.push({
      id: inboxItemId('run_interrupted', r.id),
      kind: 'run_interrupted',
      project: slug,
      title: `Run interrupted on ${r.ticket_id}; it resumes on the next start`,
      ticket_id: r.ticket_id,
      run_id: r.id,
      needs_action: false,
      updated_at: r.interrupted_at ?? r.started_at,
    });
  }

  if (open.length > 0) {
    for (const s of await tx.harnessState.list()) {
      if (s.paused_until > nowIso) {
        items.push({
          id: inboxItemId('quota_wait', s.harness_id),
          kind: 'quota_wait',
          project: slug,
          title: `${s.harness_id} is out of quota until ${s.paused_until}`,
          detail: s.reason,
          needs_action: false,
          updated_at: s.updated_at,
        });
      }
    }
  }

  const builds = await currentHarnessBuilds(tx, installedVersion);

  for (const v of await tx.harnessVersions.listByCompat('fail')) {
    if (!builds.isCurrent(v.kind, v.version)) {
      continue;
    }

    items.push({
      id: inboxItemId('harness_compat', `${v.kind}/${v.version}`),
      kind: 'harness_compat',
      project: slug,
      title: `${v.kind} ${v.version} failed its compatibility check`,
      needs_action: true,
      updated_at: v.checked_at ?? EPOCH,
    });
  }

  for (const t of await tx.harnessToolSchemas.listByStatus('pending')) {
    if (!builds.isCurrent(t.harness_kind, t.version)) {
      continue;
    }

    items.push({
      id: inboxItemId('tool_approval', `${t.harness_kind}/${t.version}/${t.tool}`),
      kind: 'tool_approval',
      project: slug,
      title: `Approve tool ${t.tool}`,
      detail: `${t.harness_kind} ${t.version}`,
      needs_action: true,
      updated_at: t.decided_at ?? builds.checkedAt(t.harness_kind, t.version) ?? EPOCH,
    });
  }

  for (const m of proposals) {
    if (m.kind === 'proposal' && m.status === 'pending') {
      items.push({
        id: inboxItemId('memory_proposal', m.id),
        kind: 'memory_proposal',
        project: slug,
        title: clip(m.statement),
        needs_action: true,
        updated_at: EPOCH,
      });
    }
  }

  return items;
}
