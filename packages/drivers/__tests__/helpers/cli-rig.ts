/**
 * Test rig that wires `createClaudeDriver` to the real node binary running `fake-claude.mjs`.
 *
 * Why: the CLI engine reads real stdin, stdout, stderr and exit codes, so faking the child
 * in-process would hide the very behaviour under test (partial lines, exit before result,
 * a hang). The rig replays canned stream-json lines through a genuine child process and
 * records what `claude` was given.
 *
 * Exports: line(), STREAM, CliRig, makeCliRig().
 * Depends on: src/adapters/claude/claude-driver, helpers/rig-base, helpers/fake-claude.mjs,
 *   node:child_process. IO: temp dirs and real node child processes.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClaudeDriver } from '#/adapters/claude/claude-driver.js';
import type { ClaudeDriverConfig } from '#/schemas/claude-config.js';
import type { GitPort, SpawnFn } from '#/types/claude/driver-deps.types.js';
import { makeRequest, tempDir } from '#tests/helpers/run-request.js';
import { fakeGit, baseDeps } from '#tests/helpers/rig-base.js';
import type { RigBase } from '#tests/helpers/rig-base.js';

const FAKE_CLAUDE = join(import.meta.dirname, 'fake-claude.mjs');

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
      for (const c of children) {
        c.kill('SIGKILL');
      }
    },
  };
}
