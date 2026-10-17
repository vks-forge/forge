/**
 * Setup recheck: a setup escalation resumes by itself once what it asked for is fixed.
 *
 * Why: when a run ends on a login or a denied tool, the owner fixes it outside the ticket (signs
 *   in, approves the tool, reviews the new build) and should not then have to come back and
 *   press a button. Each tick this looks at every setup escalation the owner holds, compares the
 *   stored facts with what it asked for (core `isSetupFixed`: cheap reads, no harness probe) and,
 *   when it is fixed, resumes the ticket the way a retry does, as an automatic action the card's
 *   history names. It only decides to try again: the next run still passes `admit()`, so a fix
 *   that did not really fix it fails the same denial and comes back as a setup again.
 *
 * Exports: resumeFixedSetups().
 * Depends on: @forge/core (isSetupFixed, escalation view), tick/escalation-effects, tick/escalation-facts,
 *   tick/tick-config. Reads storage and writes the resume in its own transaction.
 */

import { isSetupFixed, toEscalation } from '@forge/core';
import type { TicketId } from '@forge/core';
import { retryTx } from '#/tick/escalation-effects.js';
import { setupFactsFor } from '#/tick/escalation-facts.js';
import { projectSettings } from '#/tick/tick-config.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Resumes every owner-stage setup escalation whose cause is now fixed; returns how many it resumed. */
export async function resumeFixedSetups(ctx: EngineCtx): Promise<number> {
  const { storage } = ctx.deps;
  const open = (await storage.transaction((tx) => tx.interactions.listPending())).filter(
    (i) => i.kind === 'setup' && i.escalated_at !== undefined,
  );

  let resumed = 0;
  for (const row of open) {
    const view = toEscalation(row);
    if (view.payload.kind !== 'setup') {
      continue;
    }

    const cause = view.payload.cause;
    const end = await storage.transaction(async (tx) => {
      const ticket = await tx.tickets.get(row.ticket_id as TicketId);
      if (!ticket) {
        return 'stale';
      }

      const slug = (await tx.projects.get(ticket.project))?.slug ?? ticket.project;
      const facts = await setupFactsFor(
        ctx.deps,
        tx,
        cause,
        projectSettings(ctx.config, slug),
      );

      if (!isSetupFixed(cause, facts, row.escalated_at ?? row.asked_at)) {
        return 'waiting';
      }

      return retryTx(
        ctx.deps,
        tx,
        ctx.nowIso,
        row,
        { action: 'recheck', by: 'auto' },
        'engine',
      );
    });

    if (end === 'done') {
      resumed += 1;
      ctx.deps.log?.('info', `setup of ${row.ticket_id} is fixed; resuming`, {
        id: row.id,
      });
    }
  }

  return resumed;
}
