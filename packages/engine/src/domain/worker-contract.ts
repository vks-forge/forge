/**
 * What the Worker is told about its sandbox and about finishing, handed to the
 * `dispatch_prompt` step and appended to the prompt it returns.
 *
 * Why: a run is judged by gate G1 against the claims in its `finish` call, and its shell
 *   calls are judged by an unattended policy. A Worker that does not know this loses
 *   whole runs to avoidable mistakes: `cd`-ing into a worktree it is already in and
 *   having the compound line denied, running a guessed test command instead of the
 *   project's, finishing before it has listed its edits, or finishing without claims at
 *   all (probe 8, 2026-10-14). The Director's prompt step writes the goal; these rules are
 *   facts about the environment, so they are restated verbatim and never left to the
 *   model to paraphrase or drop. On a rework the Worker is also told that the previous
 *   attempt was rejected by the gates, not by a person, and what the gates found. On Standard and
 *   Full a call can also be refused as "waiting for the owner": the Worker is told once, in fixed
 *   words, that such a call did not run and must be neither retried nor worked around, and on the
 *   resume after the owner answered it is given each answer. A run that resolves a clash with main
 *   gets one more fixed clause (keep both intents, remove every marker, claim every edit), and only that run. Express never gets these lines (nobody
 *   is there to ask), so its brief stays byte-for-byte what it was (d-0175).
 *
 * Exports: workerContract(), renderWorkerContract(), OWNER_WAIT_RULE, CONFLICT_RULE.
 * Depends on: @forge/core (Lane, ProjectCheck), domain/approval-answers, types/{approval,worker-contract}. No IO.
 */

import type { Lane, ProjectCheck } from '@forge/core';
import { renderApprovalAnswers } from '#/domain/approval-answers.js';
import type { ApprovalAnswer } from '#/types/approval.types.js';
import type { WorkerContract } from '#/types/worker-contract.types.js';

const FINISH_RULES = [
  'End the run by calling the `finish` tool; a run that ends without it cannot be verified. Its schema is already available to you, call it directly.',
  'Give `finish` a typed claim for every file you edited or created ({"kind":"edited","path":...}, tests included, no exceptions); add {"kind":"ran_tests"} if you ran the project tests, {"kind":"added_test","name":...} for tests you added, and {"kind":"read",...} for files you relied on.',
  'Call `finish` once, when the work is done. If you notice a mistake in a call, call `finish` again: the last call replaces the earlier one until the run ends.',
  'Gate G1 checks each claim against the tool-call receipts and the real git diff: a claim without evidence, or an edit without a claim, fails the gate.',
  'Do not push or open pull requests; the Director publishes the branch after your run.',
] as const;

/** Told to Standard and Full Workers: a call refused as waiting for the owner did not run. */
export const OWNER_WAIT_RULE =
  'A call refused as *waiting for the owner* did not run. Do not retry or work around it. Finish what does not need it, then end your turn; you will be resumed with the answer.';

/** Told only to a Worker that resolves a clash with main; other briefs never carry it. */
export const CONFLICT_RULE =
  'Main moved while this ticket was open and the two changes clash. The files named under "wake" hold git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`). Keep both intents: combine the two changes so each still does what it was meant to do, remove every marker line, and claim every file you edit. A binary file, or one deleted on one side, cannot be merged by editing markers: keep this ticket version unless the other change makes it obsolete, and say so in your summary. Run the project checks before you finish; unresolved markers fail the gates.';

const ROLE_LABEL: Record<ProjectCheck['role'], string> = {
  test: 'Tests',
  lint: 'Lint',
  typecheck: 'Typecheck',
  build: 'Build',
  format: 'Format',
  custom: 'Check',
};

function quoted(check: ProjectCheck): string {
  return check.cwd === undefined
    ? `\`${check.command}\``
    : `\`${check.command}\` (the gates run it in \`${check.cwd}\`)`;
}

/** The test line: one exact command, or the exact commands any of which counts as running the tests. */
function testRule(tests: readonly ProjectCheck[]): string {
  const [only] = tests;
  if (only === undefined) {
    return 'The project defines no test command: do not claim `ran_tests`.';
  }

  if (tests.length === 1) {
    return `Run the project tests with exactly \`${only.command}\` as a single command (not through another wrapper); that is the command the gates match your \`ran_tests\` claim against.`;
  }

  const commands = tests.map((t) => `\`${t.command}\``).join(', ');

  return `Run the project tests with one of these exact commands, each as a single command (not through another wrapper): ${commands}; the gates match your \`ran_tests\` claim against them.`;
}

/** The other checks by role; the gates re-run every one of them after the run. */
function otherChecksRule(others: readonly ProjectCheck[]): string[] {
  if (others.length === 0) {
    return [];
  }

  const list = others
    .map((c) => {
      const label =
        c.role === 'custom' ? `${ROLE_LABEL[c.role]} (${c.name})` : ROLE_LABEL[c.role];

      return `${label}: ${quoted(c)}`;
    })
    .join('; ');

  return [
    `The gates re-run these project checks after your run, so make them pass first. ${list}.`,
  ];
}

function shellRules(checks: readonly ProjectCheck[]): string[] {
  return [
    'Your working directory is already the ticket worktree. Never `cd` into it or anywhere else; run commands directly and use relative paths.',
    'Run one shell command per call. Compound commands (`;`, `&&`, `||`, pipes) need an approval nobody can give in an unattended run and are denied. Prefer the Read, Glob, Grep and Edit tools over `cat`, `ls` and `sed`.',
    testRule(checks.filter((c) => c.role === 'test')),
    ...otherChecksRule(checks.filter((c) => c.role !== 'test')),
  ];
}

/**
 * The contract for one run: the finish and shell rules (the project's checks listed by
 * role), plus a rework note when the run follows a failed gate.
 */
export function workerContract(opts: {
  readonly rework: boolean;
  readonly checks?: readonly ProjectCheck[] | undefined;
  /** The ticket's lane; Express is unattended and gets no owner-wait lines. */
  readonly lane?: Lane | undefined;
  /** The owner's answers to the approvals of the run being resumed. */
  readonly approvals?: readonly ApprovalAnswer[] | undefined;
  /** The run resolves a merge conflict with main (its wake is `merge_conflict`): adds the conflict rule instead of the gate-rework note. */
  readonly conflict?: boolean | undefined;
}): WorkerContract {
  const attended = opts.lane !== undefined && opts.lane !== 'express';
  const answers = attended ? renderApprovalAnswers(opts.approvals ?? []) : [];
  const base = {
    finish_rules: FINISH_RULES,
    shell_rules: shellRules(opts.checks ?? []),
    ...(attended ? { owner_wait_rule: OWNER_WAIT_RULE } : {}),
    ...(answers.length > 0 ? { approval_answers: answers } : {}),
  };

  if (opts.conflict === true) {
    return { ...base, conflict_note: CONFLICT_RULE };
  }

  return opts.rework
    ? {
        ...base,
        rework_note:
          'The previous run was rejected by the verification gates, not by a person. Fix the findings, then call `finish` with typed claims for every file you edited, this run and before: edits earlier runs of this ticket made still count, so claim them and do not edit a file again only to get a receipt.',
      }
    : base;
}

/** The contract as a plain-text section that is appended to the Worker prompt. */
export function renderWorkerContract(contract: WorkerContract): string {
  const list = (lines: readonly string[]): string =>
    lines.map((l) => `- ${l}`).join('\n');

  return [
    '## Rules of this run (set by the Director)',
    '',
    'Shell:',
    list(contract.shell_rules),
    '',
    'Finishing:',
    list(contract.finish_rules),
    ...(contract.rework_note === undefined ? [] : ['', contract.rework_note]),
    ...(contract.conflict_note === undefined ? [] : ['', contract.conflict_note]),
    ...(contract.owner_wait_rule === undefined ? [] : ['', contract.owner_wait_rule]),
    ...(contract.approval_answers === undefined
      ? []
      : [
          '',
          'The owner answered your approval requests:',
          list(contract.approval_answers),
        ]),
  ].join('\n');
}
