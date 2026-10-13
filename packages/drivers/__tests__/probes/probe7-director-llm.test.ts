/**
 * Probe 7: the Claude DirectorLLM adapter against the real `claude` CLI (billable, gated).
 *
 * Why: the adapter's eight-flag command line was checked against `claude --help` and the fake
 * `claude` of the unit tests, which print the JSON shapes we expect. Only the real CLI can
 * show that the flags work together (`--tools ""` with `--json-schema`, an empty
 * `--setting-sources`, `--permission-prompts none`), the exact shape of
 * `--output-format json` (one object or an array), whether `structured_output` is filled,
 * and what the cost field is called. The raw stdout is saved under .forge/data/probes/7/
 * so the result can be recorded in RESULTS.md.
 *
 * Pins: a trivial step on haiku within $0.05 returns the typed value; the raw document is
 *   saved for inspection. Nothing is claimed until a human records the run in RESULTS.md.
 * Depends on: src/index, helpers/probe-env, a logged-in host `claude` CLI >= 2.1.296.
 *   IO: spawns the real CLI, writes under .forge/data/probes/.
 */

import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createClaudeDirectorLLM, nodeSpawn, systemClock } from '#/index.js';
import {
  childEnv,
  freshProbeDir,
  freshTempCwd,
  PROBE_MODEL,
  PROBES_ENABLED,
  SKIP_REASON,
} from '#tests/helpers/probe-env.js';

const probe = it.skipIf(!PROBES_ENABLED);

describe('probe 7: Claude DirectorLLM on the real CLI', () => {
  probe(
    `a trivial step returns the typed value within $0.05 on haiku ${SKIP_REASON}`,
    async () => {
      const out = freshProbeDir('7');
      const rawPath = join(out, 'stdout.txt');
      writeFileSync(rawPath, '');
      const llm = createClaudeDirectorLLM({
        // Tee stdout to a file so the exact `--output-format json` shape is recorded.
        spawn: (cmd, args, opts) => {
          const child = nodeSpawn(cmd, args, opts);
          child.stdout.on('data', (d: Buffer) => appendFileSync(rawPath, d));

          return child;
        },
        clock: systemClock,
        baseEnv: childEnv(),
        cwd: freshTempCwd(),
        timeoutMs: 120_000,
      });

      const Answer = z.object({ answer: z.literal('ok') });
      const result = await llm.step(
        'dispatch_prompt',
        { instruction: 'Set the field "answer" to the string "ok".' },
        Answer,
        { model: PROBE_MODEL, budgetUsd: 0.05 },
      );

      writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2));
      expect(result).toEqual({ ok: true, value: { answer: 'ok' } });
    },
    150_000,
  );
});
