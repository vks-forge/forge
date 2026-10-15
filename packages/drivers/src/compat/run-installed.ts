/**
 * Finds the installed `claude`, reads its build and runs the compatibility check on it.
 *
 * Why: the server knows the owner's harness settings (which executable, which login) but
 *   not how to find that executable or ask its version; the check needs both. This is the
 *   one call the server's compatibility service makes: `installedBuild` for the cheap
 *   question "which build is installed" (asked at start-up and after a harness test, to
 *   decide whether the build was seen before) and `checkInstalled` for the full check. A
 *   missing executable or one that prints no version is reported as `null` or a thrown
 *   `HarnessNotInstalledError` with the install pointer, not as a failed check: nothing was
 *   there to fail.
 *
 * Exports: installedBuild(), checkInstalled().
 * Depends on: @forge/core (CompatReport), adapters/claude/{harness-resolver,version-probe},
 *   compat/run-compat, domain/child-env, types. IO: spawns `claude --version` and the check.
 */

import { existsSync } from 'node:fs';
import type { CompatReport } from '@forge/core';
import { createHarnessResolver } from '#/adapters/claude/harness-resolver.js';
import { probeVersion } from '#/adapters/claude/version-probe.js';
import { runCompatCheck } from '#/compat/run-compat.js';
import { allowlistEnv } from '#/domain/child-env.js';
import type {
  InstalledCompatDeps,
  NativeToolNames,
} from '#/types/compat/compat.types.js';

async function locate(deps: InstalledCompatDeps) {
  const platform = deps.platform ?? process.platform;
  const resolver = createHarnessResolver({
    platform,
    env: deps.baseEnv,
    exists: deps.fileExists ?? existsSync,
    defaultBinary: deps.defaultBinary ?? 'claude',
    source: deps.source,
  });

  const { binaryPath } = await resolver.binary();
  const env = allowlistEnv(deps.baseEnv, deps.envPassthrough ?? []);
  const version = await probeVersion(
    deps.spawn,
    deps.clock,
    binaryPath,
    ['--version'],
    env,
  );

  return { binaryPath, version, platform };
}

/** The installed executable and the build it reports; null version when it printed none. */
export async function installedBuild(
  deps: InstalledCompatDeps,
): Promise<{ binaryPath: string; version: string | null }> {
  const { binaryPath, version } = await locate(deps);

  return { binaryPath, version };
}

/** Runs the full check on the installed build; throws when no build can be read. */
export async function checkInstalled(
  deps: InstalledCompatDeps,
  nativeTools: NativeToolNames,
): Promise<CompatReport> {
  const { binaryPath, version, platform } = await locate(deps);
  if (version === null) {
    throw new Error(`${binaryPath} did not report a version`);
  }

  return runCompatCheck({
    kind: 'claude',
    engine: deps.engine,
    binaryPath,
    version,
    nativeTools,
    clock: deps.clock,
    spawn: deps.spawn,
    baseEnv: deps.baseEnv,
    platform,
  });
}
