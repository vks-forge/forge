/**
 * The ACP engine: hosts Claude Code through the pinned `claude-agent-acp` adapter.
 *
 * Why: this is the default engine because the adapter gives live steering and session
 *   resume, which the CLI's stream-json lacks. The adapter is a bundled npm dependency, but
 *   the Claude Code it drives is the user's installed `claude`: the adapter reads
 *   `CLAUDE_CODE_EXECUTABLE` from its own process env and otherwise falls back to the CLI
 *   inside its SDK, which Forge never wants (measured, d-0101; `_meta` cannot do this).
 *   The engine sets that variable on every launch, so there is no silent fallback.
 *   `preflight()` reports the installed `claude` version and the adapter version and flags
 *   only drift of the adapter from its pin; whether a new `claude` version is compatible is
 *   the per-install check's job (d-0088). Capabilities are declared here, not guessed from
 *   the adapter at run time: the steering the Director may use is a config value, and a run
 *   whose adapter does not advertise it refuses the `steer` mode with a typed error.
 *
 * Exports: createAcpEngine(), resolveAcpEntry().
 * Depends on: acp-run, version-probe, domain/{child-env,claude-binary}, types/claude/engine.
 *   IO: resolves the adapter package; preflight spawns the adapter and `claude --version`.
 */

import { createRequire } from 'node:module';
import { launchAcp } from '#/adapters/claude/acp/acp-run.js';
import { probeVersion } from '#/adapters/claude/version-probe.js';
import { buildChildEnv } from '#/domain/child-env.js';
import { toForwardSlashes } from '#/domain/claude-binary.js';
import type { ClaudeEngine, EngineDeps } from '#/types/claude/engine.types.js';

/** Absolute path of the pinned adapter's executable entry (`node <entry>`, no shell). */
export function resolveAcpEntry(): string {
  return createRequire(import.meta.url).resolve(
    '@agentclientprotocol/claude-agent-acp/dist/index.js',
  );
}

export function createAcpEngine(deps: EngineDeps): ClaudeEngine {
  const { config } = deps;

  return {
    kind: 'acp',
    capabilities: () => ({
      resume: true,
      steerModes: config.acpSteering
        ? ['steer', 'follow_up', 'interrupt']
        : ['follow_up', 'interrupt'],
      nativeSandbox: false,
      reportsCost: true,
      structuredOutput: false,
      permissionRequests: true,
    }),
    async preflight() {
      const issues: string[] = [];
      let installed: string;
      try {
        installed = (await deps.resolver.binary()).binaryPath;
      } catch (e) {
        return { ok: false, issues: [e instanceof Error ? e.message : String(e)] };
      }

      let entry: string;
      try {
        entry = deps.acpEntry ?? resolveAcpEntry();
      } catch {
        return {
          ok: false,
          issues: ['missing binary: claude-agent-acp is not installed'],
        };
      }

      const env = buildChildEnv(deps.baseEnv, {}, {});
      const adapter = await probeVersion(
        deps.spawn,
        deps.clock,
        process.execPath,
        [entry, '--version'],
        env,
      );

      const cli = await probeVersion(
        deps.spawn,
        deps.clock,
        installed,
        ['--version'],
        env,
      );

      if (adapter === null) {
        issues.push('missing binary: the ACP adapter did not report a version');
      } else if (adapter !== config.pinnedAdapterVersion) {
        issues.push(
          `adapter version ${adapter} differs from the pinned ${config.pinnedAdapterVersion}`,
        );
      }

      if (cli === null) {
        issues.push('missing binary: the installed claude did not report a version');
      }

      return {
        ok: issues.length === 0,
        issues,
        version: `acp ${adapter ?? 'unknown'}; claude-code ${cli ?? 'unknown'}`,
        ...(cli === null ? {} : { harnessVersion: cli }),
      };
    },
    launch(launch, sink) {
      // Forward slashes: the adapter's own path handling needs them on Windows (d-0101).
      const env = {
        ...launch.env,
        CLAUDE_CODE_EXECUTABLE: toForwardSlashes(launch.claudeBinary),
      };

      return launchAcp(
        deps,
        deps.acpEntry ?? resolveAcpEntry(),
        { ...launch, env },
        sink,
      );
    },
  };
}
