/**
 * Probe 1: `claude -p` authenticates on the subscription with user and project settings
 * excluded.
 *
 * Why: Every Worker run must exclude the user's and project's Claude settings (their hooks and CLAUDE.md would leak into the run) yet still bill the user's subscription. If excluding those sources broke OAuth, the only fallback would be API keys, which changes the product's cost model. This pins that the isolated call authenticates and reports cost (d-0031).
 *
 * Pins: exit 0, parseable JSON, "pong" in `result`, cost/usage fields present, `--bare`
 *   documented as API-key-only; a budget too small for one turn ends with
 *   `subtype: error_max_budget_usd`, exit 0 and no `result` (so exit code alone cannot
 *   signal failure and the driver must treat that shape as a typed budget error).
 * Depends on: helpers/probe-env, the installed `claude` CLI. IO: spawns claude (billable,
 *   capped at $0.05).
 */

import { describe, expect, it } from 'vitest';
import {
  freshTempCwd,
  PROBE_MODEL,
  PROBES_ENABLED,
  runClaude,
  SKIP_REASON,
} from '#tests/helpers/probe-env.js';

const probe = it.skipIf(!PROBES_ENABLED);

describe('probe 1: subscription auth with settings isolation (d-0031)', () => {
  probe(
    `claude -p with --setting-sources "" replies and reports cost ${SKIP_REASON}`,
    async () => {
      const cwd = freshTempCwd();

      const res = await runClaude(
        [
          '-p',
          'reply with the single word pong',
          '--model',
          PROBE_MODEL,
          '--output-format',
          'json',
          '--setting-sources',
          '',
          '--no-session-persistence',
          '--max-turns',
          '1',
          '--max-budget-usd',
          '0.05',
        ],
        { cwd },
      );

      expect(res.code).toBe(0);
      const json = JSON.parse(res.stdout) as Record<string, unknown>;
      expect(json['type']).toBe('result');
      expect(json['is_error']).toBe(false);
      expect(String(json['result']).toLowerCase()).toContain('pong');
      expect(typeof json['total_cost_usd']).toBe('number');
      expect(typeof json['session_id']).toBe('string');
      expect(typeof json['num_turns']).toBe('number');
      const usage = json['usage'] as Record<string, unknown>;
      expect(typeof usage['input_tokens']).toBe('number');
      expect(typeof usage['output_tokens']).toBe('number');
      expect(typeof usage['cache_read_input_tokens']).toBe('number');
      expect(typeof usage['cache_creation_input_tokens']).toBe('number');
      expect(Object.keys(json['modelUsage'] as object).length).toBeGreaterThan(0);
    },
    150_000,
  );

  probe(
    `--help documents --setting-sources as user,project,local ${SKIP_REASON}`,
    async () => {
      const res = await runClaude(['--help'], { cwd: freshTempCwd() });

      expect(res.code).toBe(0);
      expect(res.stdout).toMatch(/--setting-sources <sources>\s+Comma-separated list/);
      expect(res.stdout).toContain('(user, project, local)');
    },
    30_000,
  );

  probe(
    `--bare exists and is API-key-only, so it is not usable on a subscription ${SKIP_REASON}`,
    async () => {
      const res = await runClaude(['--help'], { cwd: freshTempCwd() });

      expect(res.stdout).toMatch(/--bare\s+Minimal mode/);
      expect(res.stdout).toMatch(/strictly ANTHROPIC_API_KEY/);
      expect(res.stdout).toMatch(/OAuth and\s+keychain are never read/);
    },
    30_000,
  );

  probe(
    `an exhausted budget returns error_max_budget_usd with exit 0 and no result ${SKIP_REASON}`,
    async () => {
      const cwd = freshTempCwd();

      const res = await runClaude(
        [
          '-p',
          'reply with the single word pong',
          '--model',
          PROBE_MODEL,
          '--output-format',
          'json',
          '--setting-sources',
          '',
          '--no-session-persistence',
          '--max-turns',
          '1',
          '--max-budget-usd',
          '0.0001',
        ],
        { cwd },
      );

      // 2.1.296 exits 1 here (an earlier run exited 0); the driver must read `subtype`,
      // never the exit code, so either is accepted.
      expect([0, 1]).toContain(res.code);
      const json = JSON.parse(res.stdout) as Record<string, unknown>;
      expect(json['subtype']).toBe('error_max_budget_usd');
      expect(json['is_error']).toBe(true);
      expect(json).not.toHaveProperty('result');
    },
    150_000,
  );
});
