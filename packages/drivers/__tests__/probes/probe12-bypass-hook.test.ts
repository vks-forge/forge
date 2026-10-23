/**
 * Probe 12: a PreToolUse hook still fires and blocks under `--permission-mode bypassPermissions`.
 *
 * Why: "Bypass permissions" (d-0183) starts the harness in its no-prompt mode and relies on Forge's
 * PreToolUse hook as the only remaining gate for the hard floor (secrets, Forge's data folder,
 * push, destructive commands). If bypassPermissions skipped hooks, the floor would silently
 * vanish. This pins that the hook fires and that exit 2 still blocks the tool in that mode.
 *
 * Pins: with bypassPermissions and no allow list, PreToolUse runs for the shell call and its
 *   exit 2 blocks it (no "hi" output, tool result is an error carrying the hook's message).
 * Depends on: helpers/probe-env, helpers/hook-probe, the installed `claude` CLI. IO: spawns
 *   claude (billable, capped at $0.05 per call), writes under .forge/data/probes/2/.
 */

import { describe, expect, it } from 'vitest';
import { makeHookScenario } from '#tests/helpers/hook-probe.js';
import {
  freshTempCwd,
  parseJsonLines,
  PROBE_MODEL,
  PROBES_ENABLED,
  runClaude,
  SKIP_REASON,
} from '#tests/helpers/probe-env.js';

const probe = it.skipIf(!PROBES_ENABLED);

describe('probe 12: hooks under bypassPermissions (d-0183)', () => {
  probe(
    `PreToolUse exit 2 still blocks the tool in bypassPermissions mode ${SKIP_REASON}`,
    async () => {
      const sc = makeHookScenario('bypass-block', {
        hookTarget: 'real',
        onFailure: 'block',
      });

      const res = await runClaude(
        [
          '-p',
          'run the shell command: echo hi',
          '--model',
          PROBE_MODEL,
          '--settings',
          sc.settingsPath,
          '--setting-sources',
          '',
          '--permission-mode',
          'bypassPermissions',
          '--max-turns',
          '2',
          '--max-budget-usd',
          '0.05',
          '--output-format',
          'stream-json',
          '--verbose',
          '--include-hook-events',
        ],
        { cwd: freshTempCwd() },
      );

      const results: { isError: boolean; content: string; stdout: string | undefined }[] =
        [];

      for (const ev of parseJsonLines(res.stdout)) {
        const msg = ev['message'] as { content?: unknown } | undefined;
        if (ev['type'] !== 'user' || !Array.isArray(msg?.content)) {
          continue;
        }

        for (const b of msg.content as Record<string, unknown>[]) {
          if (b['type'] === 'tool_result') {
            const meta = ev['tool_use_result'] as { stdout?: string } | undefined;
            results.push({
              isError: b['is_error'] === true,
              content: JSON.stringify(b['content']),
              stdout: meta?.stdout,
            });
          }
        }
      }

      expect(res.code).toBe(0);
      expect(sc.readLog().some((l) => l.startsWith('PreToolUse'))).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.isError)).toBe(true);
      expect(results.some((r) => r.content.includes('blocked by probe hook'))).toBe(true);
      expect(results.some((r) => r.stdout === 'hi')).toBe(false);
    },
    150_000,
  );
});
