/**
 * Tool-approval scenario helpers: a Standard ticket with a live Worker, and the moves around it.
 *
 * Why: every approval scenario starts the same way (a request triaged into the Standard lane and a
 *   Worker running as `run-1`), has the hook raise an approval for a call, and then plays the
 *   Worker finishing and the owner answering. These helpers build that start and those moves so
 *   each scenario shows only what differs: how many items, who answers when, how the run ends.
 *
 * Exports: standardTicket(), request(), raise(), idOf(), permissionsOf(), settleRun1(), answer(), delta().
 * Depends on: helpers/rig, helpers/scripted-driver, src/types/approval. No IO.
 */

import type { Interaction } from '@forge/core';
import type { ToolApprovalRequest, ToolApprovalResult } from '#/types/approval.types.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

/** A request triaged into `lane`, dispatched as `run-1`; returns the ticket id. */
export async function standardTicket(
  rig: Rig,
  lane: 'standard' | 'full' = 'standard',
): Promise<string> {
  rig.llm.script('triage', {
    lane,
    confidence: 0.9,
    predicted_files: ['src/a.ts'],
    questions: [],
    type: 'fix',
    tier_predicted: 'A',
    title: 'Scripted triage title',
  });

  const id = await rig.request('Add a dependency');
  await rig.tick();

  return id;
}

/** The request the server sends for an `ask`; `what` names the call, the key defaults to a hash of it. */
export const request = (
  what: string,
  over: Partial<ToolApprovalRequest> = {},
): ToolApprovalRequest => ({
  runId: 'run-1',
  tool: 'shell',
  action: 'shell',
  what,
  approvalKey: `key:${what}`,
  reasonCode: 'rule_ask',
  always: { offered: true, rule: { action: 'shell', resource: what } },
  ...over,
});

/** Raises an approval for `what` on run-1 and returns the result. */
export const raise = (
  rig: Rig,
  what: string,
  over: Partial<ToolApprovalRequest> = {},
): Promise<ToolApprovalResult> => rig.engine.raiseToolApproval(request(what, over));

/** The interaction id of a raised result; fails the test when it was refused. */
export function idOf(result: ToolApprovalResult): string {
  if (result.status !== 'raised') {
    throw new Error(`the approval was refused: ${result.reason}`);
  }

  return result.interactionId;
}

/** The ticket permission interactions, oldest first. */
export async function permissionsOf(rig: Rig, ticketId: string): Promise<Interaction[]> {
  return (await rig.storage.transaction((tx) => tx.interactions.listByTicket(ticketId)))
    .filter((i) => i.kind === 'permission')
    .sort((a, b) => a.asked_at.localeCompare(b.asked_at));
}

/** Ends run-1 with `status` (a Worker that finished anyway, or failed) and settles it. */
export async function settleRun1(
  rig: Rig,
  status: 'success' | 'error' = 'success',
): Promise<void> {
  rig.driver.finish(
    'run-1',
    makeResult(
      status === 'success'
        ? { status, session: 'sess-A' }
        : { status, session: 'sess-A', errorFamily: 'crash' },
    ),
  );

  await rig.flush();
  await rig.tick();
}

/** The owner acts on an item. */
export const answer = (
  rig: Rig,
  id: string,
  action: 'allow_once' | 'allow_always' | 'deny',
  author = 'owner',
  note?: string,
) =>
  rig.engine.actOnEscalation(
    id,
    action === 'deny' && note !== undefined ? { action, note } : { action },
    author,
  );

/** The input the n-th `dispatch_prompt` step was given (0 = the first run). */
export const delta = (rig: Rig, n: number): string =>
  JSON.stringify(rig.llm.callsTo('dispatch_prompt')[n]?.input);
