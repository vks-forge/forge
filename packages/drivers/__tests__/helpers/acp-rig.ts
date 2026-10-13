/**
 * Test rig that wires `createClaudeDriver` to an in-process fake ACP agent.
 *
 * Why: the engine tests need a complete driver in one line, with the fake adapter still
 * reachable so a test can script what it says, read what the driver sent, advance the
 * clock or change what the hook recorded. Every spawned "adapter" gets its own fake agent,
 * so resume and restart tests see separate processes.
 *
 * Exports: AcpRig, makeAcpRig().
 * Depends on: src/adapters/claude/claude-driver, helpers/rig-base, helpers/fake-acp-agent,
 *   helpers/fake-child. No real processes.
 */

import { createClaudeDriver } from '#/adapters/claude/claude-driver.js';
import type { ClaudeDriverConfig } from '#/schemas/claude-config.js';
import type { GitPort } from '#/types/claude/driver-deps.types.js';
import { createFakeAcp } from '#tests/helpers/fake-acp-agent.js';
import type { FakeAcp, FakeAcpOptions } from '#tests/helpers/fake-acp-agent.js';
import { createFakeChild, recordingSpawn } from '#tests/helpers/fake-child.js';
import type { SpawnCall } from '#tests/helpers/fake-child.js';
import { makeRequest } from '#tests/helpers/run-request.js';
import { fakeGit, baseDeps } from '#tests/helpers/rig-base.js';
import type { RigBase } from '#tests/helpers/rig-base.js';

export interface AcpRig extends RigBase {
  readonly spawns: SpawnCall[];
  readonly agents: FakeAcp[];
  /** Options for the next spawned adapter. */
  next: FakeAcpOptions;
}

export function makeAcpRig(
  over: Partial<ClaudeDriverConfig> = {},
  git: GitPort = fakeGit(),
  platform: NodeJS.Platform = 'linux',
): AcpRig {
  const agents: FakeAcp[] = [];
  const rig = { next: { auth: 'account', steering: true } as FakeAcpOptions };
  const { spawn, calls } = recordingSpawn((call) => {
    if (call.command === 'taskkill') {
      const killer = createFakeChild(undefined);
      setImmediate(() => killer.exit(0));

      return killer;
    }

    if (call.args.includes('--version')) {
      const child = createFakeChild();
      child.stdoutPipe.write(
        call.args.includes('--cli') ? '2.1.293 (Claude Code)\n' : '0.89.1\n',
      );

      child.exit(0);

      return child;
    }

    const fake = createFakeAcp(rig.next);
    agents.push(fake);

    return fake.child;
  });

  const b = baseDeps(spawn, { engine: 'acp', ...over }, git, platform);
  b.deps = {
    ...b.deps,
    // Recorded instead of really signalling; the killed fake adapter then exits like a real one.
    signalGroup: (pid, signal) => {
      b.groupSignals.push({ pid, signal });
      for (const a of agents) {
        if (a.child.pid === pid) {
          a.child.exit(null, signal);
        }
      }
    },
  };

  const driver = createClaudeDriver(b.deps);

  return {
    driver,
    deps: b.deps,
    clock: b.clock,
    receipts: b.receipts,
    runsRoot: b.root,
    logs: b.logs,
    groupSignals: b.groupSignals,
    spawns: calls,
    agents,
    get next() {
      return rig.next;
    },
    set next(v: FakeAcpOptions) {
      rig.next = v;
    },
    request: (o) => makeRequest(o),
    scriptSuccess() {
      rig.next = { auth: 'account', steering: true };
    },
    scriptHang() {
      rig.next = {
        auth: 'account',
        steering: true,
        onPrompt: async (ctx) => {
          if (ctx.turn > 0) {
            await ctx.update({
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: 'done' },
            });

            return { stopReason: 'end_turn' };
          }

          await ctx.cancelled;

          return { stopReason: 'cancelled' };
        },
      };
    },
    async close() {
      for (const a of agents) {
        a.child.exit(0);
      }
    },
  };
}
