/**
 * Full rig: a pipeline rig whose ticket runs the Full lane and has a plan to be checked against.
 *
 * Why: the Full lane's Director check reads the plan entry of the ticket (its acceptance criteria and
 *   planned files), so a scenario needs a ticket that came from an approved plan, which a bare chat
 *   request is not. These helpers seed that plan on the card the request made, play the two writers
 *   and the gates, and start the two checks one after the other (a per-project limit of one Worker
 *   means the reviewer and the critic each take a tick), so each Full scenario shows only what
 *   differs: the findings, the tier, the signer, the failure.
 *
 * Exports: makeFullRig(), seedPlan(), toChecks(), passChecks(), pendingItem(), cardNotes(), HIGH, holdByCritic(),
 *   settleTicks().
 * Depends on: helpers/pipeline-rig, helpers/escalation-rig, src/tick/card-log, @forge/core. No IO.
 */

import type { CardEvent, Interaction } from '@forge/core';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import {
  makePipelineRig,
  review,
  reviewDone,
  runIds,
  writerDone,
} from '#tests/helpers/pipeline-rig.js';
import type { PipelineRig } from '#tests/helpers/pipeline-rig.js';

/** A Full-lane rig at `tier`; the triage verdict says Full. */
export const makeFullRig = (tier: 'A' | 'B' | 'C' = 'A'): Promise<PipelineRig> =>
  makePipelineRig({ lane: 'full', tier });

/** Gives the ticket's card an approved plan whose one entry names `files` and `acceptance`. */
export async function seedPlan(
  v: PipelineRig,
  ticketId: string,
  plan: { files?: string[]; acceptance?: string[] } = {},
): Promise<void> {
  const at = new Date(v.rig.clock.now()).toISOString();
  await v.rig.storage.transaction(async (tx) => {
    const ticket = await tx.tickets.get(ticketId as never);
    const card = ticket?.card_id;
    if (!card) {
      throw new Error(`${ticketId} has no card`);
    }

    await tx.cardPlanning.appendPlan({
      card_id: card,
      version: 1,
      created_at: at,
      author: 'director',
      config_version: 0,
      base_sha: 'abc123',
      goal: 'Fix the doctor check',
      scope: [],
      non_goals: [],
      decisions: [],
      assumptions: [],
      verification: {
        blast_radius: 'small',
        files_read: [],
        overlaps: [],
        matching_decisions: [],
        rejected_hits: [],
        risks: [],
      },
      tickets: [
        {
          key: 't1',
          title: 'Fix the doctor check',
          body: 'Fix it.',
          acceptance: plan.acceptance ?? ['the doctor check passes'],
          priority: 'normal',
          depends_on: [],
          lane: 'full',
          size: 'M',
          files: plan.files ?? ['src/a.ts'],
        },
      ],
      card_links: [],
      enhance_report: '',
    });

    await logCardEvent(tx, card, {
      kind: 'plan_approved',
      at,
      actor: ENGINE_ACTOR,
      payload: {
        version: 1,
        by: 'director',
        ticket_ids: [ticketId as never],
        plan_keys: ['t1'],
      },
    });
  });
}

/**
 * Requests the ticket, seeds its plan (unless `plan` is false), plays the test-writer and the
 * implementer, and returns with the reviewer's run started. `SENTINEL` is the implementer's narrative.
 */
export async function toChecks(
  v: PipelineRig,
  opts: {
    plan?: false | { files?: string[]; acceptance?: string[] };
    sentinel?: string;
  } = {},
): Promise<string> {
  const { rig } = v;
  const id = await rig.request('Fix the doctor check');
  if (opts.plan !== false) {
    await seedPlan(v, id, opts.plan);
  }

  await rig.tick();
  await writerDone(
    rig,
    'run-1',
    [{ kind: 'edited', path: 'src/a.test.ts' }],
    'wrote the tests',
  );

  await rig.tick();
  await writerDone(
    rig,
    'run-2',
    [{ kind: 'edited', path: 'src/a.ts' }],
    opts.sentinel ?? 'implemented it',
  );

  await rig.tick();

  return id;
}

/**
 * The reviewer (run-3) and the critic (run-4) both pass, one tick each; returns after the tick that
 * follows the critic, which is when the Director check starts (it is a step, not a run) and,
 * the job being done, applies on the next tick.
 */
export async function passChecks(v: PipelineRig): Promise<void> {
  const { rig } = v;
  await reviewDone(rig, 'run-3', review('pass'));
  await rig.tick();
  await reviewDone(rig, 'run-4', review('pass'));
  await rig.tick();
  // The Director check ran as a job; the tick it asked for applies it and goes on.
  for (let i = 0; i < 4 && runIds(rig).length > 0; i++) {
    await rig.flush();
    await rig.tick();
  }
}

/** The pending interaction of `kind` on the ticket, or undefined. */
export async function pendingItem(
  v: PipelineRig,
  ticketId: string,
  kind: string,
): Promise<Interaction | undefined> {
  const rows = await v.rig.storage.transaction((tx) =>
    tx.interactions.listByTicket(ticketId),
  );

  return rows.find((r) => r.kind === kind && r.status === 'pending');
}

/** The card's `note` events of the ticket's card, as text. */
export async function cardNotes(v: PipelineRig, ticketId: string): Promise<string[]> {
  const ticket = await v.rig.ticket(ticketId);
  const events: CardEvent[] = ticket.card_id
    ? await v.rig.storage.transaction((tx) =>
        tx.cardEvents.list(ticket.card_id as never, { limit: 500 }),
      )
    : [];

  return events.flatMap((e) => (e.kind === 'note' ? [e.payload.text] : []));
}

export const HIGH = {
  severity: 'high' as const,
  file: 'src/a.ts',
  line: 12,
  issue: 'the null case is not handled',
  evidence: 'src/a.ts:12 `return x.value` runs when x is null',
};

/** Reviewer passes, critic reports a high finding: the ticket is held. */
export async function holdByCritic(v: PipelineRig): Promise<string> {
  const { rig } = v;
  const id = await toChecks(v);
  await reviewDone(rig, 'run-3', review('pass'));
  await rig.tick();
  await reviewDone(rig, 'run-4', review('changes', [HIGH]));
  await rig.tick();

  return id;
}

/** Ticks (flushing jobs in between) until nothing more happens. */
export async function settleTicks(v: PipelineRig, n = 4): Promise<void> {
  for (let i = 0; i < n; i++) {
    await v.rig.tick();
    await v.rig.flush();
  }
}
