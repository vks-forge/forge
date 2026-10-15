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
 * Exports: installedBuild(), clearBuildCache(), checkInstalled().
 * Depends on: @forge/core (CompatReport), adapters/claude/{harness-resolver,version-probe},
 *   compat/run-compat, domain/child-env, types. IO: spawns `claude --version` and the check.
 */

import { existsSync, statSync } from 'node:fs';
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

/** Builds already read, by `path|mtime|size`: an in-place upgrade changes the file, so it misses. */
const buildCache = new Map<string, string | null>();

/** The cache key of an executable, or null when it cannot be stat-ed (then nothing is cached). */
function fileKey(binaryPath: string): string | null {
  try {
    const s = statSync(binaryPath);

    return `${binaryPath}|${s.mtimeMs}|${s.size}`;
  } catch {
    return null;
  }
}

/** Forgets every cached build (tests). */
export function clearBuildCache(): void {
  buildCache.clear();
}

/**
 * The installed executable and the build it reports; null version when it printed none.
 * The `--version` child is spawned once per file state (path, mtime, size): the server asks
 * before every run start, and a spawn each time would cost a process per Worker, while a
 * replaced binary has a new mtime or size and is read again.
 */
export async function installedBuild(
  deps: InstalledCompatDeps,
): Promise<{ binaryPath: string; version: string | null }> {
  const platform = deps.platform ?? process.platform;
  const resolver = createHarnessResolver({
    platform,
    env: deps.baseEnv,
    exists: deps.fileExists ?? existsSync,
    defaultBinary: deps.defaultBinary ?? 'claude',
    source: deps.source,
  });

  const { binaryPath } = await resolver.binary();
  const key = fileKey(binaryPath);
  if (key !== null && buildCache.has(key)) {
    return { binaryPath, version: buildCache.get(key) ?? null };
  }

  const env = allowlistEnv(deps.baseEnv, deps.envPassthrough ?? []);
  const version = await probeVersion(
    deps.spawn,
    deps.clock,
    binaryPath,
    ['--version'],
    env,
  );

  // A build that printed nothing is not cached: the next ask tries again.
  if (key !== null && version !== null) {
    buildCache.set(key, version);
  }

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
