/**
 * Contract cases for `projects.purge`.
 *
 * Why: deleting a project must remove every row it owns, or re-adding the same folder
 *   would show the old project's tickets, runs and cards under the new one; and it must
 *   never reach into another project, or deleting one repository would destroy a
 *   neighbour's history. Both backends are held to the same walk: tickets and what hangs
 *   off them, runs and their records, cards with their history, relations, queued replies,
 *   plan versions and card questions, inbox marks, pipeline snapshots with their stage rows and
 *   artifacts, fetched research sources, card evidence and Director spend rows, the project row.
 *
 * Exports: describeProjectPurgeContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_PIPELINES } from '@forge/core';
import type { CardId, StorageAdapter, TicketId } from '@forge/core';
import {
  T0,
  makeGate,
  makeInboxMessage,
  makeInteraction,
  makeIntake,
  makeProject,
  makeRun,
  makeTextEvent,
  makeTicket,
  makeWake,
} from '#tests/helpers/fixtures.js';
import { seedResearch } from '#tests/helpers/research-seed.js';

const HASH = 'a'.repeat(64);
const cardIdOf = (slug: string): CardId => `${slug.toUpperCase()}-C1` as CardId;
const peerIdOf = (slug: string): CardId => `${slug.toUpperCase()}-C2` as CardId;

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeProjectPurgeContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  /** One project's full footprint: ticket `n` under `slug`, with a run, card and the rest. */
  async function seed(slug: string, n: number): Promise<void> {
    const ticket = makeTicket(n, { project: slug });
    const runId = `run-${slug}`;
    const cardId = cardIdOf(slug);

    await tx(async (t) => {
      await t.projects.upsert(makeProject(slug, { slug }));
      await t.tickets.insert(ticket);
      await t.ticketRelations.add({
        from_id: ticket.id,
        to_id: makeTicket(n + 50).id as TicketId,
        kind: 'related',
      });

      await t.intakeEvents.insertIfNew(makeIntake(`k-${slug}`, { project: slug }));
      await t.wakeRequests.insertIfNew(
        makeWake(`k-${slug}`, { id: `w-${slug}`, ticket_id: ticket.id }),
      );

      await t.runs.insert(
        makeRun(runId, { ticket_id: ticket.id, project: slug, status: 'success' }),
      );

      await t.runEvents.append(runId, makeTextEvent());
      await t.runInbox.append(makeInboxMessage(runId));
      await t.runTokens.issue(runId, HASH, T0);
      await t.gateResults.insert(makeGate(runId));
      await t.interactions.insert(
        makeInteraction(`int-${slug}`, { ticket_id: ticket.id, run_id: runId }),
      );

      await t.cards.insert({
        id: cardId,
        project: slug,
        type: 'issue',
        title: 'c',
        summary: 's',
        source: { kind: 'chat', ref: 'm' },
        created_by: { type: 'user', id: 'u1' },
        created_at: T0,
        updated_at: T0,
        phase: 'grilling',
        phase_version: 0,
        needs_you: false,
        priority: 'normal',
        links: [],
      });

      await t.cards.insert({ ...(await t.cards.get(cardId))!, id: peerIdOf(slug) });
      await t.cardRelations.add(
        { from: cardId, to: peerIdOf(slug), kind: 'depends_on' },
        T0,
      );

      await t.cardPlanning.appendPlan({
        card_id: cardId,
        version: 1,
        created_at: T0,
        author: 'director',
        config_version: 1,
        base_sha: 'abc',
        goal: 'g',
        scope: [],
        non_goals: [],
        decisions: [],
        assumptions: [],
        verification: {
          blast_radius: 'none',
          files_read: [],
          overlaps: [],
          matching_decisions: [],
          rejected_hits: [],
          risks: [],
          evidence: [],
          outside_claims: [],
        },
        tickets: [],
        card_links: [],
        enhance_report: '',
      });

      await t.cardReplyQueue.enqueue({
        card_id: cardId,
        event_id: 0,
        reason: 'card_created',
        enqueued_at: T0,
      });

      await t.interactions.insert(
        makeInteraction(`cint-${slug}`, { ticket_id: 'none', card_id: cardId }),
      );

      await t.cardEvents.append(cardId, {
        kind: 'note',
        at: T0,
        actor: { type: 'system', id: 's' },
        payload: { text: 'hi' },
      });

      await t.inboxStates.upsert({ project: slug, kind: 'question', item_id: 'i' });

      // The pipeline footprint of the ticket: snapshot, one stage attempt, one artifact.
      await t.ticketPipelines.insert({
        ticket_id: ticket.id,
        lane: 'express',
        definition: BUILTIN_PIPELINES.express,
        roles: { implementer: 'writer' },
        hash: HASH,
        base_hash: HASH,
        config_version: 'c0:p0',
        routed: [],
        adjustments: [],
        created_at: T0,
        updated_at: T0,
      });

      const stageRun = await t.stageRuns.start({
        ticket_id: ticket.id,
        stage_id: 'implementer',
        member_id: '',
        cycle: 0,
        kind: 'agent',
        status: 'passed',
        run_id: runId,
        started_at: T0,
      });

      await t.stageArtifacts.add({
        ticket_id: ticket.id,
        stage_run_id: stageRun as number,
        kind: 'diff',
        content: 'd',
        truncated: false,
        sha256: HASH,
        created_at: T0,
      });

      await seedResearch(t, slug, cardId, ticket.id, runId);
      await t.directorSpend.append({
        project: slug,
        card_id: cardId,
        ticket_id: ticket.id,
        kind: 'card_chat',
        usd: 0.5,
        recorded: true,
        at: T0,
      });
    });
  }

  /** What the adapter still holds for the project seeded by `seed(slug, n)`. */
  async function footprint(slug: string, n: number) {
    const ticketId = makeTicket(n).id;
    const runId = `run-${slug}`;

    return tx(async (t) => ({
      project: await t.projects.get(slug),
      ticket: await t.tickets.get(ticketId),
      relations: await t.ticketRelations.listFor(ticketId),
      wakes: (await t.wakeRequests.listDue('2999-01-01T00:00:00.000Z')).filter(
        (w) => w.ticket_id === ticketId,
      ),
      run: await t.runs.get(runId),
      events: await t.runEvents.listByRun(runId),
      inbox: await t.runInbox.listUndelivered(runId),
      token: await t.runTokens.getHash(runId),
      gates: await t.gateResults.listByTicket(ticketId),
      interaction: await t.interactions.get(`int-${slug}`),
      cardInteraction: await t.interactions.get(`cint-${slug}`),
      card: await t.cards.get(cardIdOf(slug)),
      peer: await t.cards.get(peerIdOf(slug)),
      cardRelations: await t.cardRelations.listFor(cardIdOf(slug)),
      cardReplies: await t.cardReplyQueue.listOpen(cardIdOf(slug)),
      cardPlans: await t.cardPlanning.listPlans(cardIdOf(slug)),
      cardEvents: await t.cardEvents.list(cardIdOf(slug), { limit: 10 }),
      mark: await t.inboxStates.get(slug, 'question', 'i'),
      pipeline: await t.ticketPipelines.get(ticketId),
      stageRuns: await t.stageRuns.listByTicket(ticketId),
      artifacts: await t.stageArtifacts.listByTicket(ticketId),
      cardSources: await t.researchSources.listByCard(cardIdOf(slug)),
      runSources: await t.researchSources.listByRun(runId),
      evidence: await t.evidence.listByCard(cardIdOf(slug)),
      directorSpend: await t.directorSpend.listByProject(slug),
    }));
  }

  describe('projects.purge', () => {
    it('removes every row the project owns and reports it existed', async () => {
      await seed('alpha', 1);

      const existed = await tx((t) => t.projects.purge('alpha'));

      expect(existed).toBe(true);
      expect(await footprint('alpha', 1)).toEqual({
        project: null,
        ticket: null,
        relations: [],
        wakes: [],
        run: null,
        events: [],
        inbox: [],
        token: null,
        gates: [],
        interaction: null,
        cardInteraction: null,
        card: null,
        peer: null,
        cardRelations: [],
        cardReplies: [],
        cardPlans: [],
        cardEvents: [],
        mark: null,
        pipeline: null,
        stageRuns: [],
        artifacts: [],
        cardSources: [],
        runSources: [],
        evidence: [],
        directorSpend: [],
      });
    });

    it('leaves another project untouched', async () => {
      await seed('alpha', 1);
      await seed('beta', 2);
      const before = await footprint('beta', 2);

      await tx((t) => t.projects.purge('alpha'));

      expect(await footprint('beta', 2)).toEqual(before);
      expect(before.project).not.toBeNull();
      expect(before.events).toHaveLength(1);
      expect(before.cardRelations).toHaveLength(1);
      expect(before.cardReplies).toHaveLength(1);
      expect(before.cardPlans).toHaveLength(1);
      expect(before.cardInteraction).not.toBeNull();
      expect(before.cardSources).toHaveLength(1);
      expect(before.runSources).toHaveLength(1);
      expect(before.evidence).toHaveLength(1);
    });

    it('returns false for an unknown slug and changes nothing', async () => {
      await seed('beta', 2);
      const before = await footprint('beta', 2);

      expect(await tx((t) => t.projects.purge('ghost'))).toBe(false);
      expect(await footprint('beta', 2)).toEqual(before);
    });

    it('lets the same slug be registered and used again afterwards', async () => {
      await seed('alpha', 1);
      await tx((t) => t.projects.purge('alpha'));

      await seed('alpha', 1);

      expect((await footprint('alpha', 1)).ticket).not.toBeNull();
    });
  });
}
