/**
 * Shared harness for the Slice 2 preflight probes: gating, child env, `claude -p` runner.
 *
 * Why: The live probes drive the real harness on the user's subscription. If they ran in plain `pnpm test` they would spend money and make CI nondeterministic; if they inherited the parent session's env the child `claude` refuses to start; if they wrote into the repo tree they would pollute it. This helper gates them on FORGE_PROBES=1, sanitises the child env and confines artefacts to the gitignored .forge/data/probes/ (m0-brief.md Slice 2).
 *
 * Exports: PROBES_ENABLED, SKIP_REASON, PROBE_MODEL, REPO_ROOT, childEnv(), freshProbeDir(),
 *   freshTempCwd(), slashPath(), RunResult, runClaude(), parseJsonLines().
 * Depends on: node:child_process, node:fs, node:os, node:path. IO: spawns `claude`, writes
 *   under .forge/data/probes/ and the OS temp dir.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '#tests/helpers/temp.js';

/** True only when the operator asked for the live probes (`pnpm probes`). */
export const PROBES_ENABLED = process.env['FORGE_PROBES'] === '1';

/** Why a probe is skipped, shown in the test title so the reason is visible in reports. */
export const SKIP_REASON = '[skipped unless FORGE_PROBES=1; run `pnpm probes`]';

/**
 * Cheapest alias: the default model (a 1M-context flagship) spends more than the
 * $0.05 probe budget on its system prompt alone and returns `error_max_budget_usd`.
 */
export const PROBE_MODEL = 'haiku';

/** Absolute repo root, derived from this file's location (packages/drivers/__tests__/helpers). */
export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** Env for a child harness: parent env minus the vars that make `claude` refuse nesting. */
export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete env['CLAUDECODE'];
  delete env['CLAUDE_CODE_ENTRYPOINT'];

  return env;
}

/** Recreates and returns `.forge/data/probes/<...segments>` (gitignored). */
export function freshProbeDir(...segments: string[]): string {
  const dir = join(REPO_ROOT, '.forge', 'data', 'probes', ...segments);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  return dir;
}

/** A new empty working directory outside the repo, so no project settings are discovered. */
export function freshTempCwd(): string {
  return makeTempDir('forge-probe-');
}

/** Forward-slash form of a path, safe to embed in a hook `command` string on Windows. */
export function slashPath(p: string): string {
  return p.replaceAll('\\', '/');
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs `claude <args>` with a clean env, stdin closed, and a hard timeout. */
export function runClaude(
  args: string[],
  opts: { cwd: string; timeoutMs?: number },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd: opts.cwd,
      env: childEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude timed out after ${opts.timeoutMs ?? 120_000}ms`));
    }, opts.timeoutMs ?? 120_000);

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** Parses `--output-format stream-json` stdout (one JSON object per line). */
export function parseJsonLines(stdout: string): Record<string, unknown>[] {
  return stdout
    .split('\n')
    .filter((l) => l.trim().startsWith('{'))
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}
