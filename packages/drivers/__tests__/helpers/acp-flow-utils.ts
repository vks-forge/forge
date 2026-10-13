/**
 * Shared probes and builders for the ACP engine flow tests.
 *
 * Why: the event, permission, receipt and steering suites all drive the same fake adapter
 * through the same rig and wait on the same observable facts (a prompt arrived, a receipt
 * was asked for). One copy keeps those suites agreeing on what "started" and "asked" mean.
 *
 * Exports: promptSeen(), receiptAsked(), bash(), events(), selected().
 * Depends on: @forge/core, helpers/claude-rigs. No IO of its own.
 */

import { RunEvent } from '@forge/core';
import { makeAcpRig } from '#tests/helpers/claude-rigs.js';

export const promptSeen = (rig: ReturnType<typeof makeAcpRig>) => () =>
  rig.agents[0]?.methods().includes('session/prompt') ?? false;

export const receiptAsked = (rig: ReturnType<typeof makeAcpRig>) => () =>
  rig.receipts.asked.length > 0;

export const bash = (id: string, command = 'echo hi') => ({
  toolCallId: id,
  name: 'Bash',
  title: command,
  rawInput: { command },
});

export async function events(rig: ReturnType<typeof makeAcpRig>, runId = 'run-1') {
  const out: RunEvent[] = [];
  for await (const e of rig.driver.events({ runId })) {
    out.push(e);
  }

  return out;
}

export const selected = (r: unknown): string | undefined =>
  (r as { outcome?: { optionId?: string } }).outcome?.optionId;
