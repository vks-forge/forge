/**
 * Project checks — re-runs the repo's lint, typecheck and test commands.
 *
 * Why: the Worker may say the suite is green; only a run outside its control proves it.
 *   This runs the commands from `.forge/project.yaml` in the worktree, in the order
 *   cheapest first (lint, typecheck, test), and every defined one runs even after an
 *   earlier failure so one rework prompt carries all the problems. Under `profile:
 *   generic` the TypeScript-only `typecheck` is `skipped` with its reason, never passed
 *   (d-0034). A command that times out or exits non-zero is a finding; one that cannot be
 *   spawned makes the check `error`, because "could not run" is not "passed".
 *
 * Exports: runProjectChecks(), DEFAULT_COMMAND_TIMEOUT_MS.
 * Depends on: @forge/core (ProjectConfig), shared/env, shared/tail, types. Runs commands through the injected seam.
 */

import { scrubEnv } from '#/shared/env.js';
import { tail } from '#/shared/tail.js';
import type {
  CheckOutcome,
  ProjectCheckInput,
  ProjectCheckSteps,
} from '#/types/check.types.js';

export const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

/** Output kept in a finding message; the report section keeps a longer tail. */
const FINDING_TAIL_CHARS = 1500;

const ORDER = ['lint', 'typecheck', 'test'] as const;

async function runOne(
  step: ProjectCheckSteps,
  kind: (typeof ORDER)[number],
  command: string,
  input: ProjectCheckInput,
): Promise<void> {
  const check = `project:${kind}`;
  try {
    const result = await input.run({
      command,
      cwd: input.cwd,
      env: scrubEnv(input.env, input.passEnv),
      timeoutMs: input.timeoutMs,
    });

    const ok = !result.timedOut && result.exitCode === 0;
    const verdict = result.timedOut
      ? `timed out after ${input.timeoutMs} ms`
      : `exit code ${String(result.exitCode)}`;

    step.lines.push(
      `### ${kind}: ${ok ? 'passed' : 'failed'} (\`${command}\`, ${verdict})`,
    );

    if (!ok) {
      // The finding is the rework prompt: without the output the Worker cannot tell why.
      const why = tail(result.output, FINDING_TAIL_CHARS).trimEnd();
      const detail = why === '' ? '' : `\n${why}`;
      step.findings.push({
        check,
        message: `\`${command}\` failed: ${verdict}${detail}`,
      });

      step.lines.push('```', tail(result.output).trimEnd(), '```');
    }
  } catch (e) {
    step.errored = true;
    const reason = e instanceof Error ? e.message : String(e);
    step.lines.push(`### ${kind}: could not run (\`${command}\`): ${reason}`);
  }
}

/** Runs the defined commands in order and folds them into one outcome. */
export async function runProjectChecks(input: ProjectCheckInput): Promise<CheckOutcome> {
  const step: ProjectCheckSteps = { lines: [], findings: [], errored: false };
  for (const kind of ORDER) {
    const command = input.project.commands[kind];
    if (command === undefined) {
      step.lines.push(`### ${kind}: not configured`);
    } else if (kind === 'typecheck' && input.project.profile === 'generic') {
      step.lines.push(
        `### ${kind}: skipped (TypeScript-only check under profile "generic", d-0034)`,
      );
    } else {
      await runOne(step, kind, command, input);
    }
  }

  let status: CheckOutcome['status'] = 'passed';
  if (step.findings.length > 0) {
    status = 'failed';
  } else if (step.errored) {
    status = 'error';
  }

  return {
    name: 'project-checks',
    status,
    findings: step.findings,
    details: step.lines.join('\n'),
  };
}
