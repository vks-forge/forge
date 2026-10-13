/**
 * Test rigs that wire `createClaudeDriver` to fakes: a fake ACP agent, or a fake `claude`.
 *
 * Why: the contract and the engine tests need a complete driver (config, ports, clock,
 *   receipts, spawn) in one line, with the fakes still reachable so a test can script the
 *   adapter, read what the driver sent, advance the clock or change what the hook
 *   recorded. The ACP rig hands every spawned "adapter" its own in-process fake agent; the
 *   CLI rig runs the real node binary on `fake-claude.mjs`, so stdin, stdout and exit codes
 *   are genuine.
 *
 * Exports: AcpRig, makeAcpRig(), CliRig, makeCliRig(), STREAM, line().
 * Depends on: src/adapters/claude/claude-driver, helpers/* fakes, node:child_process.
 *   IO: temp dirs and (CLI rig) real node child processes.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClaudeDriver } from '#/adapters/claude/claude-driver.js';
import type { ClaudeDriverConfig } from '#/schemas/claude-config.js';
import type {
  ClaudeDriverDeps,
  GitPort,
  SpawnFn,
} from '#/types/claude/driver-deps.types.js';
import { createFakeAcp } from '#tests/helpers/fake-acp-agent.js';
import type { FakeAcp, FakeAcpOptions } from '#tests/helpers/fake-acp-agent.js';
import { createFakeChild, recordingSpawn } from '#tests/helpers/fake-child.js';
import type { SpawnCall } from '#tests/helpers/fake-child.js';
import { createFakeClock } from '#tests/helpers/fake-clock.js';
import type { FakeClock } from '#tests/helpers/fake-clock.js';
import { createFakeReceipts } from '#tests/helpers/fake-receipts.js';
import type { FakeReceipts } from '#tests/helpers/fake-receipts.js';
import type { ContractHarness } from '#tests/contract/worker-driver.contract.js';
import { makePrepareRun, makeRequest, tempDir } from '#tests/helpers/run-request.js';

const FAKE_CLAUDE = join(import.meta.dirname, 'fake-claude.mjs');

export const fakeGit = (files: string[] = ['src/a.ts']): GitPort => ({
  head: async () => 'base-sha',
  changedFiles: async () => files,
});

interface RigBase extends ContractHarness {
  readonly clock: FakeClock;
  readonly receipts: FakeReceipts;
  readonly runsRoot: string;
  readonly logs: { level: string; message: string; fields?: unknown }[];
  readonly deps: ClaudeDriverDeps;
  /** Process-group kills the driver issued (POSIX path), instead of really signalling. */
  readonly groupSignals: { pid: number; signal: NodeJS.Signals }[];
}

function baseDeps(
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
      for (const a of agents) if (a.child.pid === pid) a.child.exit(null, signal);
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
      for (const a of agents) a.child.exit(0);
    },
  };
}

/** One JSON line of the CLI stream. */
export const line = (o: unknown): string => JSON.stringify(o);

/** Canned stream-json lines for the CLI tests. */
export const STREAM = {
  init: line({ type: 'system', subtype: 'init', session_id: 'cli-sess-1' }),
  text: line({
    type: 'assistant',
    session_id: 'cli-sess-1',
    message: { content: [{ type: 'text', text: 'hello' }] },
  }),
  toolUse: (id: string, name = 'Bash', input: unknown = { command: 'echo hi' }) =>
    line({
      type: 'assistant',
      session_id: 'cli-sess-1',
      message: { content: [{ type: 'tool_use', id, name, input }] },
    }),
  toolResult: (id: string, content: unknown = 'ok', isError = false) =>
    line({
      type: 'user',
      session_id: 'cli-sess-1',
      message: {
        content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }],
      },
    }),
  result: (over: Record<string, unknown> = {}) =>
    line({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'finished',
      session_id: 'cli-sess-1',
      total_cost_usd: 0.0123,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 2,
        cache_creation_input_tokens: 1,
      },
      ...over,
    }),
};

export interface CliRig extends RigBase {
  /** Lines the next `claude` replays. */
  fixture(
    lines: string[],
    opts?: { exit?: number; hang?: boolean; stderr?: string },
  ): void;
  /** argv, stdin, cwd and env the last `claude` received. */
  lastCall(): { argv: string[]; stdin: string; cwd: string; env: Record<string, string> };
}

export function makeCliRig(
  over: Partial<ClaudeDriverConfig> = {},
  git: GitPort = fakeGit(),
): CliRig {
  const dir = tempDir('forge-cli-rig-');
  const fixturePath = join(dir, 'fixture.jsonl');
  const recordPath = join(dir, 'record.json');
  let mode: { exit: number; hang: boolean; stderr: string } = {
    exit: 0,
    hang: false,
    stderr: '',
  };
  writeFileSync(fixturePath, [STREAM.init, STREAM.text, STREAM.result()].join('\n'));
  const children: ReturnType<typeof nodeSpawn>[] = [];
  const rigSpawn: SpawnFn = (_cmd, args, opts) => {
    const child = nodeSpawn(process.execPath, [FAKE_CLAUDE, ...args], {
      cwd: opts.cwd ?? dir,
      env: {
        ...(opts.env ?? {}),
        FAKE_CLAUDE_FIXTURE: fixturePath,
        FAKE_CLAUDE_RECORD: recordPath,
        FAKE_CLAUDE_EXIT: String(mode.exit),
        FAKE_CLAUDE_HANG: mode.hang ? '1' : '0',
        FAKE_CLAUDE_STDERR: mode.stderr,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    children.push(child);
    return child;
  };
  // 'linux' so the kill path is the process-group one; the rig signals the single real pid.
  const b = baseDeps(rigSpawn, { engine: 'cli', ...over }, git, 'linux');
  b.deps = {
    ...b.deps,
    signalGroup: (pid, signal) => {
      b.groupSignals.push({ pid, signal });
      try {
        process.kill(pid, signal);
      } catch {
        // already gone
      }
    },
  };
  const driver = createClaudeDriver(b.deps);
  const success = [STREAM.init, STREAM.text, STREAM.result()];
  const set = (lines: string[], m: typeof mode): void => {
    writeFileSync(fixturePath, lines.join('\n'));
    mode = m;
  };
  return {
    driver,
    deps: b.deps,
    clock: b.clock,
    receipts: b.receipts,
    runsRoot: b.root,
    logs: b.logs,
    groupSignals: b.groupSignals,
    request: (o) => makeRequest(o),
    scriptSuccess: () => set(success, { exit: 0, hang: false, stderr: '' }),
    scriptHang: () => set([STREAM.init], { exit: 0, hang: true, stderr: '' }),
    fixture: (lines, o = {}) =>
      set(lines, { exit: o.exit ?? 0, hang: o.hang ?? false, stderr: o.stderr ?? '' }),
    lastCall: () => JSON.parse(readFileSync(recordPath, 'utf8')),
    async close() {
      for (const c of children) c.kill('SIGKILL');
    },
  };
}
