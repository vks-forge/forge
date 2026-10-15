/**
 * Project checks — re-runs every check the project configured, in its order.
 *
 * Why: the Worker may say the suite is green; only a run outside its control proves it.
 *   A project lists its checks (tests, lint, typecheck, build, format, custom) in the
 *   order it wants them run, for any language (d-0095); this runs each one in the
 *   worktree, and every check runs even after an earlier failure so one rework prompt
 *   carries all the problems. A role the project did not configure is simply absent, never
 *   a skip or a pass. A command that times out or exits non-zero is a finding; one that
 *   cannot be spawned makes the check `error`, because "could not run" is not "passed". A
 *   check with an empty command or a working directory outside the worktree is a finding
 *   too (fail closed): nothing ran, so nothing may count as passed.
 *
 * Exports: runProjectChecks(), DEFAULT_COMMAND_TIMEOUT_MS.
 * Depends on: @forge/core (ProjectCheck), shared/env, shared/tail, types. Runs commands through the injected seam.
 */

import { isAbsolute, relative, resolve } from 'node:path';
import type { ProjectCheck } from '@forge/core';
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

/** The directory a check runs in: the worktree, or `check.cwd` inside it; null when it escapes. */
function workingDir(root: string, check: ProjectCheck): string | null {
  if (check.cwd === undefined) {
    return root;
  }

  const dir = resolve(root, check.cwd);
  const rel = relative(resolve(root), dir);

  return rel.startsWith('..') || isAbsolute(rel) ? null : dir;
}

function refuse(step: ProjectCheckSteps, check: ProjectCheck, why: string): void {
  step.lines.push(`### ${label(check)}: not run (${why})`);
  step.findings.push({
    check: `project:${check.name}`,
    message: `${check.role} check "${check.name}" was not run: ${why}`,
  });
}

const label = (check: ProjectCheck): string =>
  check.name === check.role ? check.name : `${check.name} (${check.role})`;

async function runOne(
  step: ProjectCheckSteps,
  check: ProjectCheck,
  input: ProjectCheckInput,
): Promise<void> {
  const command = check.command;
  if (command.trim() === '') {
    refuse(step, check, 'its command is empty');

    return;
  }

  const cwd = workingDir(input.cwd, check);
  if (cwd === null) {
    refuse(step, check, `its working directory "${check.cwd}" is outside the worktree`);

    return;
  }

  const id = `project:${check.name}`;
  try {
    const result = await input.run({
      command,
      cwd,
      env: scrubEnv(input.env, input.passEnv),
      timeoutMs: input.timeoutMs,
    });

    const ok = !result.timedOut && result.exitCode === 0;
    const verdict = result.timedOut
      ? `timed out after ${input.timeoutMs} ms`
      : `exit code ${String(result.exitCode)}`;

    step.lines.push(
      `### ${label(check)}: ${ok ? 'passed' : 'failed'} (\`${command}\`, ${verdict})`,
    );

    if (!ok) {
      // The finding is the rework prompt: without the output the Worker cannot tell why.
      const why = tail(result.output, FINDING_TAIL_CHARS).trimEnd();
      const detail = why === '' ? '' : `\n${why}`;
      step.findings.push({
        check: id,
        message: `${check.role} check \`${command}\` failed: ${verdict}${detail}`,
      });

      step.lines.push('```', tail(result.output).trimEnd(), '```');
    }
  } catch (e) {
    step.errored = true;
    const reason = e instanceof Error ? e.message : String(e);
    step.lines.push(`### ${label(check)}: could not run (\`${command}\`): ${reason}`);
  }
}

/** Runs the project's checks in list order and folds them into one outcome. */
export async function runProjectChecks(input: ProjectCheckInput): Promise<CheckOutcome> {
  const step: ProjectCheckSteps = { lines: [], findings: [], errored: false };
  for (const check of input.project.checks) {
    await runOne(step, check, input);
  }

  if (input.project.checks.length === 0) {
    step.lines.push('No checks are configured for this project.');
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
