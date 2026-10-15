/**
 * Compatibility probe (B7): the compatibility check on the installed Claude Code build (free, gated).
 *
 * Why: the check is what lets Forge run whatever `claude` the owner installed (d-0088). Its
 * unit tests use hand-made traces; only a real build can show that the scripted model, the
 * hook, the adapter and the judge actually fit together on this machine. The check spends no
 * money: the model is a local stand-in and the harness gets a throwaway config folder and a
 * fake key. If it ever fails on a build that works, the check is wrong, not the build.
 *
 * Pins: the installed build passes every applicable check; its tools map to all catalogue
 *   native tools the build offers with sha256 shapes; the shipped list agrees with what the
 *   build sends when the build is on the list.
 * Depends on: src/index (checkInstalled), helpers/probe-env, the installed `claude`, a prior
 *   `pnpm build`. IO: spawns the adapter and the installed claude, writes under the OS temp folder.
 */

import { BUILT_IN_CATALOGUE } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import { checkInstalled, findKnownGood, nodeSpawn, systemClock } from '#/index.js';
import {
  installedClaudePath,
  PROBES_ENABLED,
  SKIP_REASON,
} from '#tests/helpers/probe-env.js';

const probe = it.skipIf(!PROBES_ENABLED);

function nativeNames(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const def of BUILT_IN_CATALOGUE.entries) {
    const native =
      def.kind === 'harness-native' ? def.support['claude-code']?.native : undefined;

    if (native !== undefined) {
      out[def.id] = Array.isArray(native) ? [...native] : [native];
    }
  }

  return out;
}

describe('compat probe: compatibility check of the installed build', () => {
  probe(
    `passes every applicable check and captures the built-in tool shapes ${SKIP_REASON}`,
    async () => {
      const report = await checkInstalled(
        {
          source: () => ({
            id: 'claude',
            authMode: 'login',
            binaryPath: installedClaudePath(),
          }),
          spawn: nodeSpawn,
          clock: systemClock,
          engine: 'acp',
          baseEnv: process.env,
        },
        nativeNames(),
      );

      const failed = report.checks.filter((c) => c.status === 'fail');
      expect(failed, report.summary).toEqual([]);
      expect(report.passed).toBe(true);
      expect(report.tools.map((t) => t.tool)).toEqual(
        expect.arrayContaining(['read', 'glob', 'grep', 'edit', 'write', 'shell']),
      );

      const known = findKnownGood(report.version);
      if (known) {
        for (const shape of report.tools) {
          expect(shape.schema_hash, `${shape.tool} on ${report.version}`).toBe(
            known.tools[shape.tool],
          );
        }
      }
    },
    300_000,
  );
});
