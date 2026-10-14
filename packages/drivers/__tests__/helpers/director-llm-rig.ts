/**
 * Test rig that wires `createClaudeDirectorLLM` to a fake `claude` and a manual clock.
 *
 * Why: the adapter's value is in how it launches `claude` (flags, stdin, env), reads the
 *   one JSON document it prints and classifies how the call ended. Those can be pinned only
 *   against a real child process on real pipes, so the rig runs the real node binary on
 *   `fake-claude.mjs`, steered by a fixture file, while the clock stays manual so the
 *   timeout is one `advance()`. The same rig scripts the contract's responses as the JSON
 *   shapes `claude -p --output-format json` prints.
 *
 * Exports: DirectorRig, makeDirectorRig(), resultDoc().
 * Depends on: src/adapters/claude/director-llm, helpers/fake-claude.mjs, helpers/fake-clock,
 *   contract/director-llm.contract. IO: temp dirs and real node child processes.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClaudeDirectorLLM } from '#/adapters/claude/director-llm.js';
import type { ClaudeDirectorLLMDeps } from '#/types/claude/director-llm.types.js';
import type { SpawnFn } from '#/types/claude/driver-deps.types.js';
import type { DirectorLLMHarness } from '#tests/contract/director-llm.contract.js';
import type { ScriptedResponse } from '#tests/contract/director-llm.contract.js';
import { createFakeClock } from '#tests/helpers/fake-clock.js';
import type { FakeClock } from '#tests/helpers/fake-clock.js';
import { tempDir } from '#tests/helpers/run-request.js';
import { SECRET_ENV } from '#tests/helpers/secret-env.js';

const FAKE_CLAUDE = join(import.meta.dirname, 'fake-claude.mjs');

/** A `result` document as `claude -p --output-format json` prints it. */
export const resultDoc = (
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: '',
  session_id: 'dir-sess-1',
  total_cost_usd: 0.0021,
  ...over,
});

export interface DirectorRig extends DirectorLLMHarness {
  readonly clock: FakeClock;
  readonly deps: ClaudeDirectorLLMDeps;
  /** Prints `stdout` (as is, one fixture line per `\n`) the next time `claude` runs. */
  fixture(
    stdout: string,
    opts?: { exit?: number; hang?: boolean; stderr?: string },
  ): void;
  /** argv, stdin, cwd and env the last `claude` received. */
  lastCall(): { argv: string[]; stdin: string; cwd: string; env: Record<string, string> };
  /** True once the fake `claude` has started and recorded its call. */
  started(): boolean;
  /** Pids signalled by the kill path. */
  readonly kills: number[];
}

export function makeDirectorRig(over: Partial<ClaudeDirectorLLMDeps> = {}): DirectorRig {
  const dir = tempDir('forge-director-rig-');
  const fixturePath = join(dir, 'fixture.jsonl');
  const recordPath = join(dir, 'record.json');
  let mode = { exit: 0, hang: false, stderr: '' };
  writeFileSync(fixturePath, '');
  const clock = createFakeClock();
  const children: ReturnType<typeof nodeSpawn>[] = [];
  const kills: number[] = [];
  const spawn: SpawnFn = (_cmd, args, opts) => {
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

  const deps: ClaudeDirectorLLMDeps = {
    spawn,
    clock,
    baseEnv: {
      PATH: process.env['PATH'],
      CLAUDECODE: '1',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      CLAUDE_CONFIG_DIR: '/kept',
      ...SECRET_ENV,
    },
    // The user's claude is "installed" at a fixed fake path; the spawn runs the fake anyway.
    claudeBinary: '/forge/test/bin/claude',
    fileExists: () => true,
    // 'linux' so the kill path is the process-group one; the rig signals the single real pid.
    platform: 'linux',
    signalGroup: (pid, signal) => {
      kills.push(pid);
      try {
        process.kill(pid, signal);
      } catch {
        // already gone
      }
    },
    ...over,
  };

  const fixture: DirectorRig['fixture'] = (stdout, o = {}) => {
    writeFileSync(fixturePath, stdout);
    mode = { exit: o.exit ?? 0, hang: o.hang ?? false, stderr: o.stderr ?? '' };
  };

  const script = (r: ScriptedResponse): void => {
    const doc = JSON.stringify;
    switch (r.kind) {
      case 'valid':
        return fixture(doc(resultDoc({ structured_output: r.value })));
      case 'off_schema':
        return fixture(doc(resultDoc({ structured_output: { wrong: 1 } })));
      case 'rate_limit':
        return fixture(
          doc([
            {
              type: 'rate_limit_event',
              rate_limit_info: {
                status: 'rejected',
                resetsAt: Math.floor(clock.now() / 1000) + 3600,
              },
            },
            resultDoc({
              is_error: true,
              result: 'You have hit your usage limit',
              api_error_status: 429,
            }),
          ]),
          { exit: 1 },
        );
      case 'auth':
        return fixture(
          doc(
            resultDoc({
              is_error: true,
              result: 'Invalid API key. Please run /login',
              api_error_status: 401,
            }),
          ),
          { exit: 1 },
        );
      case 'budget':
        return fixture(
          doc(
            resultDoc({
              subtype: 'error_max_budget_usd',
              is_error: true,
              result: undefined,
            }),
          ),
        );
      case 'refusal':
        return fixture(
          doc(resultDoc({ result: 'I cannot help with that.', stop_reason: 'refusal' })),
        );
      case 'crash':
        return fixture('segmentation fault', { exit: 139, stderr: 'boom' });
    }
  };

  return {
    llm: createClaudeDirectorLLM(deps),
    clock,
    deps,
    kills,
    script,
    fixture,
    now: () => clock.now(),
    started: () => existsSync(recordPath),
    lastCall: () => JSON.parse(readFileSync(recordPath, 'utf8')),
    async close() {
      for (const c of children) {
        c.kill('SIGKILL');
      }
    },
  };
}
