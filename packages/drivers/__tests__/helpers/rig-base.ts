/**
 * Shared base of the Claude driver test rigs: fake git, rig shape and default deps.
 *
 * Why: the ACP rig and the CLI rig must give the driver the same world (config, receipts,
 * clock, run directory, logging, a stale environment the driver has to scrub) and differ
 * only in how the harness process is faked. One base keeps the two engines under test
 * against identical inputs, so a difference in behaviour is the engine's, not the setup's.
 *
 * Exports: fakeGit(), RigBase, baseDeps().
 * Depends on: src/adapters/claude types, helpers/fake-clock, helpers/fake-receipts,
 *   helpers/run-request. IO: temp dirs.
 */

import type { ClaudeDriverConfig } from '#/schemas/claude-config.js';
import type {
  ClaudeDriverDeps,
  GitPort,
  SpawnFn,
} from '#/types/claude/driver-deps.types.js';
import { createFakeClock } from '#tests/helpers/fake-clock.js';
import type { FakeClock } from '#tests/helpers/fake-clock.js';
import { createFakeReceipts } from '#tests/helpers/fake-receipts.js';
import type { FakeReceipts } from '#tests/helpers/fake-receipts.js';
import type { ContractHarness } from '#tests/contract/worker-driver.contract.js';
import { makePrepareRun, tempDir } from '#tests/helpers/run-request.js';

export const fakeGit = (files: string[] = ['src/a.ts']): GitPort => ({
  head: async () => 'base-sha',
  changedFiles: async () => files,
});

export interface RigBase extends ContractHarness {
  readonly clock: FakeClock;
  readonly receipts: FakeReceipts;
  readonly runsRoot: string;
  readonly logs: { level: string; message: string; fields?: unknown }[];
  readonly deps: ClaudeDriverDeps;
  /** Process-group kills the driver issued (POSIX path), instead of really signalling. */
  readonly groupSignals: { pid: number; signal: NodeJS.Signals }[];
}

export function baseDeps(
  rigSpawn: SpawnFn,
  over: Partial<ClaudeDriverConfig>,
  git: GitPort,
  platform: NodeJS.Platform,
): {
  deps: ClaudeDriverDeps;
  clock: FakeClock;
  receipts: FakeReceipts;
  root: string;
  logs: RigBase['logs'];
  groupSignals: RigBase['groupSignals'];
} {
  const clock = createFakeClock();
  const receipts = createFakeReceipts();
  receipts.allowAll = true;
  const root = tempDir('forge-runs-');
  const logs: RigBase['logs'] = [];
  const groupSignals: RigBase['groupSignals'] = [];
  const deps: ClaudeDriverDeps = {
    config: over,
    prepareRun: makePrepareRun(root),
    receipts,
    clock,
    spawn: rigSpawn,
    git,
    log: (level, message, fields) => logs.push({ level, message, fields }),
    baseEnv: {
      PATH: process.env['PATH'],
      CLAUDECODE: '1',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      FORGE_HOOK_CONFIG: '/stale/hook.json',
      HOME_MARKER: 'kept',
    },
    platform,
    signalGroup: (pid, signal) => groupSignals.push({ pid, signal }),
    hookJsPath: '/forge/bin/hook.js',
    acpEntry: '/acp/dist/index.js',
    homeDir: tempDir('forge-home-'),
  };

  return { deps, clock, receipts, root, logs, groupSignals };
}
