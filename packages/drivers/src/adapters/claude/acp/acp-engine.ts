/**
 * The ACP engine: hosts Claude Code through the pinned `claude-agent-acp` adapter.
 *
 * Why: this is the default engine because the adapter gives live steering and session
 *   resume, which the CLI's stream-json lacks. It runs the Claude Code binary bundled with
 *   the pinned SDK, never the host's `claude`, so every measured fact about hooks, modes and
 *   budgets stays tied to one known build (d-0053); `preflight()` therefore reports both the
 *   adapter version and the bundled CLI version and flags drift from the pin. Capabilities
 *   are declared here, not guessed from the adapter at run time: the steering the Director
 *   may use is a config value, and a run whose adapter does not advertise it refuses the
 *   `steer` mode with a typed error.
 *
 * Exports: createAcpEngine(), resolveAcpEntry().
 * Depends on: acp-run, version-probe, domain/child-env, types/claude/engine. IO: resolves
 *   the adapter package; preflight spawns the adapter twice.
 */

import { createRequire } from 'node:module';
import { launchAcp } from '#/adapters/claude/acp/acp-run.js';
import { probeVersion } from '#/adapters/claude/version-probe.js';
import { buildChildEnv } from '#/domain/child-env.js';
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
        process.execPath,
        [entry, '--cli', '--version'],
        env,
      );
      if (adapter === null)
        issues.push('missing binary: the ACP adapter did not report a version');
      else if (adapter !== config.pinnedAdapterVersion)
        issues.push(
          `adapter version ${adapter} differs from the pinned ${config.pinnedAdapterVersion}`,
        );
      if (cli === null)
        issues.push('missing binary: the bundled Claude Code did not report a version');
      else if (cli !== config.pinnedCliVersion)
        issues.push(
          `bundled Claude Code ${cli} differs from the pinned ${config.pinnedCliVersion}`,
        );
      return {
        ok: issues.length === 0,
        issues,
        version: `acp ${adapter ?? 'unknown'}; claude-code ${cli ?? 'unknown'}`,
      };
    },
    launch(launch, sink) {
      return launchAcp(deps, deps.acpEntry ?? resolveAcpEntry(), launch, sink);
    },
  };
}
