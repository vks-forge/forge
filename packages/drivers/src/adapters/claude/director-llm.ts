/**
 * Claude implementation of the DirectorLLM port: one `claude -p` child per Director step.
 *
 * Why: the Director asks a model for judgement in finite steps (triage, dispatch prompt,
 *   steer reply) and must get back a schema-valid value or a typed failure, never a crash
 *   or a half-parsed object. Running the user's installed `claude` in print mode costs
 *   nothing extra on a subscription (d-0032). The executable and auth mode (login, API
 *   key, OAuth token) are resolved as for Workers, per step, and a missing install or
 *   credential is a typed step error before anything is spawned (d-0087). A step must be isolated from everything a
 *   Worker may use: no tools, no settings or hooks, no saved session, no permission prompt,
 *   a hard spend cap (flags in domain/director-step-args). The prompt goes on stdin inside
 *   a data fence because intake text is untrusted. The exit code is never read: a budget
 *   stop can exit 0 and a success can exit 1 (d-0057), so the printed document decides. A
 *   child that outlives its timeout is killed with its tree and reported as a stall, so one
 *   hung call cannot block the Director's tick. The timeout comes per step from config
 *   (`opts.timeoutMs`), else the adapter's default. Planning steps stay tool-less with the
 *   same isolation flags: file reads for the survey and verify steps are done engine-side
 *   through `admit()` under the director grant and handed back as input on a second call
 *   (d-0131, d-0141 item 4), so this adapter never gets a tool. The call's dollar cost is
 *   handed to `opts.onCost` so the card can count Director spend (d-0143); a failing
 *   callback never changes the step result. `onTrace` hands the rendered prompt and the raw
 *   stdout to the app for the debug trace (d-0163); it never receives secrets the adapter holds
 *   (the child's env and credentials stay inside `runChild`).
 *
 * Exports: createClaudeDirectorLLM().
 * Depends on: @forge/core, adapters/claude/{process-tree,harness-resolver},
 *   domain/{child-env,director-step-args,director-step-prompts,director-step-result},
 *   types/claude. IO: the `claude` child process, SecretStore reads, file-existence checks.
 */

import { existsSync } from 'node:fs';
import { AuthError, err } from '@forge/core';
import type { DirectorLLM, StepError, StepName, StepOptions } from '@forge/core';
import type { ZodType } from 'zod';
import { createHarnessResolver } from '#/adapters/claude/harness-resolver.js';
import { killTree } from '#/adapters/claude/process-tree.js';
import { allowlistEnv, buildChildEnv } from '#/domain/child-env.js';
import { buildDirectorArgs, jsonSchemaArg } from '#/domain/director-step-args.js';
import { buildStepPrompt } from '#/domain/director-step-prompts.js';
import { interpretOutput, parseCliOutput } from '#/domain/director-step-result.js';
import type { ClaudeDirectorLLMDeps } from '#/types/claude/director-llm.types.js';
import type { RawRun } from '#/types/claude/director-step.types.js';
import type { ChildLike } from '#/types/claude/driver-deps.types.js';
import type { ResolvedHarness } from '#/types/claude/harness.types.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_BACKOFF_MS = 60_000;
const STDERR_TAIL = 1_500;
const STDOUT_TAIL = 500;

/** Runs the child to its end (or the timeout) and gathers stdout and a diagnostic tail. */
async function runChild(
  deps: ClaudeDirectorLLMDeps,
  harness: ResolvedHarness,
  args: string[],
  prompt: string,
  timeoutMs: number,
): Promise<RawRun> {
  const platform = deps.platform ?? process.platform;
  let child: ChildLike;
  try {
    child = deps.spawn(harness.binaryPath, args, {
      ...(deps.cwd ? { cwd: deps.cwd } : {}),
      env: buildChildEnv(
        allowlistEnv(deps.baseEnv ?? {}, deps.envPassthrough),
        {},
        {},
        harness.authEnv,
      ),
      detached: platform !== 'win32',
    });
  } catch (e) {
    return spawnFailure(e);
  }

  let stdout = '';
  let stderrTail = '';
  child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
  child.stderr.on(
    'data',
    (d: Buffer) => (stderrTail = (stderrTail + d.toString('utf8')).slice(-STDERR_TAIL)),
  );

  child.stdin.on('error', () => undefined);
  child.stdin.end(prompt);

  const drained = new Promise<void>((resolve) => {
    child.stdout.on('end', resolve);
    child.stdout.on('close', resolve);
  });

  const exited = new Promise<{ exit: string; error?: string }>((resolve) => {
    child.on('exit', (code, signal) =>
      resolve({ exit: `code ${code}, signal ${signal}` }),
    );

    child.on('error', (e) => resolve({ exit: 'not started', error: e.message }));
  });

  const settled = exited.then(async (x) => {
    if (!x.error) {
      await drained;
    }

    return x;
  });

  let cancelTimer = (): void => undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    cancelTimer = deps.clock.after(timeoutMs, () => resolve('timeout'));
  });

  const winner = await Promise.race([settled, timedOut]);
  cancelTimer();
  if (winner === 'timeout') {
    await killTree(child, {
      platform,
      spawn: deps.spawn,
      ...(deps.signalGroup ? { signalGroup: deps.signalGroup } : {}),
    });

    return {
      stdout,
      tail: stderrTail,
      exit: 'killed',
      failure: 'timeout',
      detail: `claude timed out after ${timeoutMs}ms and was killed`,
    };
  }

  const tail = `${stderrTail} ${stdout.slice(-STDOUT_TAIL)}`.trim();

  return winner.error
    ? { stdout, tail, exit: winner.exit, failure: 'spawn', detail: winner.error }
    : { stdout, tail, exit: winner.exit };
}

function spawnFailure(e: unknown): RawRun {
  return {
    stdout: '',
    tail: '',
    exit: 'not started',
    failure: 'spawn',
    detail: e instanceof Error ? e.message : String(e),
  };
}

/** Builds a DirectorLLM that runs each step as a `claude -p` child (flags verified on claude 2.1.296). */
export function createClaudeDirectorLLM(deps: ClaudeDirectorLLMDeps): DirectorLLM {
  const resolver = createHarnessResolver({
    platform: deps.platform ?? process.platform,
    env: deps.baseEnv ?? {},
    exists: deps.fileExists ?? existsSync,
    defaultBinary: deps.claudeBinary ?? 'claude',
    source: deps.harness,
    secrets: deps.secrets,
  });

  return {
    capabilities: () => ({ structuredOutput: true, reportsCost: true }),
    async step<T>(name: StepName, input: unknown, schema: ZodType<T>, opts: StepOptions) {
      // Both builders throw InvalidInputError: a caller bug, not a model failure.
      const args = buildDirectorArgs(jsonSchemaArg(schema), opts);
      const prompt = buildStepPrompt(name, input);
      let harness: ResolvedHarness;
      try {
        harness = await resolver.forRun();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        deps.log?.('warn', 'director step failed', { step: name, kind: 'harness' });

        return err(
          e instanceof AuthError
            ? { kind: 'auth', message }
            : { kind: 'crash', message: `cannot run claude: ${message}` },
        );
      }

      const timeoutMs = opts.timeoutMs ?? deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const raw = await runChild(deps, harness, args, prompt, timeoutMs);
      try {
        deps.onTrace?.({
          step: name,
          prompt,
          raw: raw.stdout,
          exit: raw.exit,
          tail: raw.tail,
        });
      } catch {
        // A trace callback must never change what a step returns.
      }

      let error: StepError | undefined;
      if (raw.failure === 'timeout') {
        error = { kind: 'stall', message: raw.detail ?? 'claude timed out' };
      } else if (raw.failure === 'spawn') {
        error = { kind: 'crash', message: `cannot run claude: ${raw.detail}` };
      }

      if (error) {
        deps.log?.('warn', 'director step failed', { step: name, kind: error.kind });

        return err(error);
      }

      const output = parseCliOutput(raw.stdout);
      const cost = output.result?.total_cost_usd;
      if (cost !== undefined && opts.onCost) {
        try {
          opts.onCost(cost);
        } catch (e) {
          deps.log?.('warn', 'director onCost callback failed', {
            step: name,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const result = interpretOutput(output, schema, {
        nowMs: deps.clock.now(),
        backoffMs: deps.rateLimitBackoffMs ?? DEFAULT_BACKOFF_MS,
        tail: raw.tail,
        exit: raw.exit,
      });

      if (!result.ok) {
        deps.log?.('warn', 'director step failed', {
          step: name,
          kind: result.error.kind,
        });
      }

      return result;
    },
  };
}
