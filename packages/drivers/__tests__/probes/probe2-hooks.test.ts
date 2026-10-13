/**
 * Probe 2: settings-file hooks fire inside `claude -p`, block a tool call, and fail closed.
 *
 * Why: The permission gate for native tools is a PreToolUse hook. If hooks did not fire in non-interactive runs, or a crashed hook let the tool through, a Worker could act outside policy unnoticed. This pins that hooks fire, exit 2 blocks, a hook that cannot run blocks only with onFailure "block", and that project hooks are ignored under isolation (d-0033, d-0031).
 *
 * Pins: SessionStart + PreToolUse hooks run; exit 2 blocks the tool (no "hi" output); a
 *   hook command that cannot run blocks with onFailure "block" and is fail-open without it;
 *   a project .claude/settings.json hook is ignored under --setting-sources "".
 * Depends on: helpers/probe-env, helpers/hook-probe, the installed `claude` CLI. IO: spawns
 *   claude (billable, capped at $0.05 per call), writes under .forge/data/probes/2/.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeHookScenario } from '#tests/helpers/hook-probe.js';
import {
  freshProbeDir,
  freshTempCwd,
  parseJsonLines,
  PROBE_MODEL,
  PROBES_ENABLED,
  runClaude,
  SKIP_REASON,
  slashPath,
} from '#tests/helpers/probe-env.js';

const probe = it.skipIf(!PROBES_ENABLED);

interface ToolResult {
  isError: boolean;
  content: string;
  stdout: string | undefined;
}

/** Runs the echo prompt with a scenario's settings and returns tool results from the stream. */
async function runEcho(settingsPath: string) {
  const res = await runClaude(
    [
      '-p',
      'run the shell command: echo hi',
      '--model',
      PROBE_MODEL,
      '--settings',
      settingsPath,
      '--setting-sources',
      '',
      '--allowedTools',
      'Bash,PowerShell',
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

  const results: ToolResult[] = [];
  for (const ev of parseJsonLines(res.stdout)) {
    if (ev['type'] !== 'user') {
      continue;
    }

    const msg = ev['message'] as { content?: unknown } | undefined;
    if (!Array.isArray(msg?.content)) {
      continue;
    }

    for (const block of msg.content as Record<string, unknown>[]) {
      if (block['type'] !== 'tool_result') {
        continue;
      }

      const meta = ev['tool_use_result'] as { stdout?: string } | undefined;
      results.push({
        isError: block['is_error'] === true,
        content: JSON.stringify(block['content']),
        stdout: meta?.stdout,
      });
    }
  }

  return { res, results };
}

describe('probe 2: hooks fire and block inside -p (d-0033)', () => {
  probe(
    `PreToolUse exit 2 blocks the tool; SessionStart and PreToolUse both fire ${SKIP_REASON}`,
    async () => {
      const sc = makeHookScenario('block', { hookTarget: 'real', onFailure: 'block' });

      const { res, results } = await runEcho(sc.settingsPath);

      expect(res.code).toBe(0);
      const log = sc.readLog();
      expect(log.some((l) => l.startsWith('SessionStart'))).toBe(true);
      expect(log.some((l) => l.startsWith('PreToolUse'))).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.isError)).toBe(true);
      expect(results.some((r) => r.content.includes('blocked by probe hook'))).toBe(true);
      expect(results.some((r) => r.stdout === 'hi')).toBe(false);
    },
    150_000,
  );

  probe(
    `missing hook script with onFailure "block" fails closed ${SKIP_REASON}`,
    async () => {
      const sc = makeHookScenario('missing-block', {
        hookTarget: 'missing',
        onFailure: 'block',
      });

      const { res, results } = await runEcho(sc.settingsPath);

      expect(res.code).toBe(0);
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.isError)).toBe(true);
      expect(results.some((r) => r.content.includes('blocking because onFailure'))).toBe(
        true,
      );

      expect(results.some((r) => r.stdout === 'hi')).toBe(false);
    },
    150_000,
  );

  probe(
    `missing hook script without onFailure is fail-open (canary for the d-0033 premise) ${SKIP_REASON}`,
    async () => {
      const sc = makeHookScenario('missing-open', { hookTarget: 'missing' });

      const { res, results } = await runEcho(sc.settingsPath);

      expect(res.code).toBe(0);
      expect(results.some((r) => !r.isError && r.stdout === 'hi')).toBe(true);
    },
    150_000,
  );

  probe(
    `--setting-sources "" ignores a project hook; --setting-sources project loads it ${SKIP_REASON}`,
    async () => {
      const dir = freshProbeDir('2', 'isolation');
      const project = join(dir, 'project');
      mkdirSync(join(project, '.claude'), { recursive: true });
      const marker = join(dir, 'project-hook-ran.txt');
      const script = join(dir, 'marker.cjs');
      writeFileSync(
        script,
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');\n`,
      );

      writeFileSync(
        join(project, '.claude', 'settings.json'),
        JSON.stringify({
          hooks: {
            SessionStart: [
              { hooks: [{ type: 'command', command: `node ${slashPath(script)}` }] },
            ],
          },
        }),
      );

      const base = [
        '-p',
        'reply with the single word pong',
        '--model',
        PROBE_MODEL,
        '--no-session-persistence',
        '--max-turns',
        '1',
        '--max-budget-usd',
        '0.05',
        '--output-format',
        'json',
      ];

      const isolated = await runClaude([...base, '--setting-sources', ''], {
        cwd: project,
      });

      const ranWhenIsolated = existsSync(marker);
      const control = await runClaude([...base, '--setting-sources', 'project'], {
        cwd: project,
      });

      expect(isolated.code).toBe(0);
      expect(ranWhenIsolated).toBe(false);
      expect(control.code).toBe(0);
      expect(existsSync(marker)).toBe(true);
    },
    300_000,
  );
});
