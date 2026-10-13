/**
 * Recording fake GitHost and scripted fake gates for the verify scenarios.
 *
 * Why: the verify flow is about the order and count of host calls (one PR per ticket, a
 *   merge only after a pass) and about what the engine does with a gate's verdict, not
 *   about git or the checks themselves. The host fake records every call and can be told
 *   to throw a given ForgeError on a call; the gate fake returns scripted verdicts per
 *   run, so a scenario reads as "first pass fails with this finding, second passes".
 *
 * Exports: FakeGitHost, createFakeGitHost(), ScriptedGate, createScriptedGate(), verdict().
 * Depends on: @forge/core (GitHost, Gate). No IO.
 */

import type {
  Gate,
  GateContext,
  GateFinding,
  GateName,
  GateStatus,
  GateVerdict,
  GitHost,
  PrState,
} from '@forge/core';

type Call = 'push' | 'openPr' | 'prStatus' | 'merge' | 'closePr' | 'deleteBranch';

export interface FakeGitHost extends GitHost {
  /** Every call in order, as `name:arg`. */
  readonly calls: string[];
  prState: PrState;
  mergeable: boolean | null;
  /** Throws `error` on the next `times` calls of `call`. */
  failNext(call: Call, error: Error, times?: number): void;
  count(call: Call): number;
}

export function createFakeGitHost(): FakeGitHost {
  const calls: string[] = [];
  const failures = new Map<Call, { error: Error; times: number }>();
  let nextPr = 41;
  const enter = (call: Call, arg: string): void => {
    calls.push(`${call}:${arg}`);
    const f = failures.get(call);
    if (f && f.times > 0) {
      f.times--;
      throw f.error;
    }
  };

  const host: FakeGitHost = {
    calls,
    prState: 'open',
    mergeable: true,
    failNext: (call, error, times = 1) => void failures.set(call, { error, times }),
    count: (call) => calls.filter((c) => c.startsWith(`${call}:`)).length,
    async push(_path, branch) {
      enter('push', branch);
    },
    async openPr(input) {
      enter('openPr', input.branch);
      nextPr++;

      return { number: nextPr, url: `https://git.test/pr/${nextPr}` };
    },
    async prStatus(n) {
      enter('prStatus', String(n));

      return { state: host.prState, mergeable: host.mergeable, headSha: 'head' };
    },
    async merge(n) {
      enter('merge', String(n));
      host.prState = 'merged';

      return { sha: 'merge-sha' };
    },
    async closePr(n) {
      enter('closePr', String(n));
    },
    async deleteBranch(branch) {
      enter('deleteBranch', branch);
    },
  };

  return host;
}

/** A gate verdict with a one-line report. */
export function verdict(
  status: GateStatus,
  findings: readonly GateFinding[] = [],
): GateVerdict {
  return { status, findings, report: `report: ${status}` };
}

export interface ScriptedGate extends Gate {
  readonly contexts: GateContext[];
  /** Verdicts (or errors to throw) consumed one per run; the last repeats. */
  script(...answers: (GateVerdict | Error)[]): void;
}

export function createScriptedGate(name: GateName = 'G1'): ScriptedGate {
  const contexts: GateContext[] = [];
  let answers: (GateVerdict | Error)[] = [verdict('passed')];

  return {
    name,
    contexts,
    script(...next) {
      answers = next;
    },
    async run(ctx) {
      contexts.push(ctx);
      const a = answers.length > 1 ? answers.shift()! : answers[0]!;
      if (a instanceof Error) {
        throw a;
      }

      return a;
    },
  };
}
