/**
 * "Test environment" for a Claude harness: is it installed, which version, which login.
 *
 * Why: before the owner trusts a harness with Workers they need a plain answer to three
 *   questions without starting a ticket: does Forge find the executable, which build is it,
 *   and which credential will it actually use (the login, the stored API key or the
 *   OAuth token). The first two cost nothing. The third is read with `claude auth status
 *   --json`, run with exactly the environment a Worker would get, so a stored API key that
 *   the CLI does not pick up shows as a mismatch here and not as a surprise bill. A real
 *   one-word model call is the only step that spends money, so it runs only when the caller
 *   asks for it; otherwise the result says it was skipped. The credential is injected into
 *   the probe children only and is never part of the result.
 *
 * Exports: testClaudeHarness().
 * Depends on: adapters/claude/{harness-resolver,capture-output,
 *   version-probe}, domain/{child-env,harness-auth}. IO: spawns up to three short-lived
 *   `claude` processes; reads one SecretStore entry.
 */

import { existsSync } from 'node:fs';
import { captureOutput } from '#/adapters/claude/capture-output.js';
import { createHarnessResolver } from '#/adapters/claude/harness-resolver.js';
import { probeVersion } from '#/adapters/claude/version-probe.js';
import { allowlistEnv, buildChildEnv } from '#/domain/child-env.js';
import { accountKindFromCliStatus, expectedCliKind } from '#/domain/harness-auth.js';
import type {
  HarnessTestDeps,
  HarnessTestResult,
  ResolvedHarness,
} from '#/types/claude/harness.types.js';

const STATUS_TIMEOUT_MS = 20_000;
const LIVE_TIMEOUT_MS = 90_000;
const LIVE_PROMPT = 'Reply with the single word: pong';

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function liveProbe(
  deps: HarnessTestDeps,
  binaryPath: string,
  env: Record<string, string>,
): Promise<string | null> {
  const out = await captureOutput(
    deps.spawn,
    deps.clock,
    binaryPath,
    [
      '-p',
      '--output-format',
      'json',
      '--tools',
      '',
      '--setting-sources',
      '',
      '--no-session-persistence',
      '--max-budget-usd',
      '0.05',
    ],
    env,
    { stdin: LIVE_PROMPT, timeoutMs: LIVE_TIMEOUT_MS },
  );

  if (out === null) {
    return 'the live probe did not answer in time';
  }

  try {
    const doc = JSON.parse(out) as unknown;
    const last = Array.isArray(doc) ? doc.at(-1) : doc;
    const isError =
      typeof last === 'object' &&
      last !== null &&
      (last as { is_error?: unknown }).is_error;

    return isError === false ? null : 'the live probe reported an error';
  } catch {
    return 'the live probe printed something that is not JSON';
  }
}

/** Resolves the harness, reads its version and active login, and optionally makes one real call. */
export async function testClaudeHarness(
  deps: HarnessTestDeps,
  opts: { readonly live: boolean },
): Promise<HarnessTestResult> {
  const platform = deps.platform ?? process.platform;
  const setup = await deps.source();
  const base = { auth_mode: setup.authMode, live: 'skipped' as const };
  const resolver = createHarnessResolver({
    platform,
    env: deps.baseEnv,
    exists: deps.fileExists ?? existsSync,
    defaultBinary: deps.defaultBinary ?? 'claude',
    source: () => setup,
    secrets: deps.secrets,
  });

  let harness: ResolvedHarness;
  try {
    harness = await resolver.forRun();
  } catch (e) {
    return { ...base, ok: false, error: messageOf(e) };
  }

  const { binaryPath, authEnv } = harness;
  const env = buildChildEnv(
    allowlistEnv(deps.baseEnv, deps.envPassthrough),
    {},
    {},
    authEnv,
  );

  const version = await probeVersion(
    deps.spawn,
    deps.clock,
    binaryPath,
    ['--version'],
    env,
  );

  if (version === null) {
    return {
      ...base,
      binary_path: binaryPath,
      ok: false,
      error: `${binaryPath} did not report a version`,
    };
  }

  const status = await captureOutput(
    deps.spawn,
    deps.clock,
    binaryPath,
    ['auth', 'status', '--json'],
    env,
    { timeoutMs: STATUS_TIMEOUT_MS },
  );

  const kind = status === null ? null : accountKindFromCliStatus(status);
  const found = { ...base, binary_path: binaryPath, version };
  const withKind = kind === null ? found : { ...found, account_kind: kind };
  if (kind !== null && kind !== expectedCliKind(setup.authMode)) {
    return {
      ...withKind,
      ok: false,
      error:
        kind === 'none'
          ? 'claude is not logged in; run `claude` once and sign in'
          : `auth mode is ${setup.authMode} but claude reports ${kind}`,
    };
  }

  if (!opts.live) {
    return { ...withKind, ok: true };
  }

  const failure = await liveProbe(deps, binaryPath, env);

  return failure === null
    ? { ...withKind, ok: true, live: 'ok' }
    : { ...withKind, ok: false, live: 'failed', error: failure };
}
