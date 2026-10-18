/**
 * Escalation copy — the plain-words titles, summaries and settings links the engine writes.
 *
 * Why: the owner reads these on the card chat and in the Inbox. They must say what is wrong
 *   without codes ("Held: the lane has no pipeline yet", not "lane_hold"), and a setup problem
 *   must link to the screen that fixes it, or the owner can see the problem and cannot act. The
 *   engine writes them (the card event title, the setup summary, the `fix_href`) so every
 *   producer words the same cause the same way; the web client adds its own richer copy on top.
 *
 * Exports: titleOf(), setupSummary(), fixHrefFor(), stillBroken(), resolveAnswer().
 * Depends on: @forge/core (escalation schemas). No IO.
 */

import type {
  EscalationActBody,
  EscalationAnswer,
  EscalationPayload,
  EscalationQuestion,
  FailureCause,
  SetupCause,
  SignOffCause,
} from '@forge/core';

const TITLE_MAX = 120;

const FAILURE_TITLES: Readonly<Record<FailureCause, string>> = {
  lane_hold: 'Held: the lane goes live in the next update',
  rework_cap: 'Stopped: automatic rework limit reached',
  retry_cap: 'Stopped: the ticket failed too many times',
  rewake_cap: 'Stopped: too many automatic restarts in an hour',
  not_retried: 'Stopped: this kind of failure is not retried automatically',
  max_turns: 'Stopped: the Worker ran out of turns',
  refused: 'Stopped: the model declined the task',
  question_timeout: 'Stopped: a question went unanswered',
  no_agent_available: 'No agent could run this stage',
};

const SIGN_OFF_TITLES: Readonly<Record<SignOffCause, string>> = {
  tier_c: 'Needs your sign-off: a tier C change',
  tier_b: 'Ready for your approval',
  owner_stage: 'Ready for your review',
  director_declined: 'Ready for your sign-off: the Director did not sign',
};

const oneLine = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim();

  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

function setupTitle(cause: SetupCause): string {
  switch (cause.type) {
    case 'login':
      return `Sign in to ${cause.harness_id} again`;
    case 'tool':
      return `A tool needs your decision: ${cause.tool}`;
    case 'harness_build':
      return `A new ${cause.harness_kind} build needs a look: ${cause.version}`;
  }
}

/** The one-line title of an escalation, for the card chat and the Inbox. */
export function titleOf(payload: EscalationPayload): string {
  switch (payload.kind) {
    case 'question':
      return oneLine(payload.text, TITLE_MAX);
    case 'failure':
      return FAILURE_TITLES[payload.cause];
    case 'setup':
      return setupTitle(payload.cause);
    case 'decision':
      return payload.cause === 'scope_drift'
        ? 'Held: the change is bigger than planned'
        : oneLine(`Held: ${payload.stage_label} found blocking findings`, TITLE_MAX);
    case 'sign_off':
      return SIGN_OFF_TITLES[payload.cause];
  }
}

const GRANT_REASONS: readonly string[] = ['not_granted', 'unattended'];

/** What is wrong and what the owner does, in a sentence or two. */
export function setupSummary(cause: SetupCause): string {
  switch (cause.type) {
    case 'login':
      return `The harness ${cause.harness_id} is signed out, so the Worker could not start. Sign in again, then check.`;
    case 'tool': {
      const fix = GRANT_REASONS.includes(cause.reason_code)
        ? `grant it to this project in its settings`
        : `approve or add it in the harness settings`;

      return `The Worker needed the tool ${cause.tool}, which Forge does not allow yet (${cause.reason_code}). To continue, ${fix}.`;
    }

    case 'harness_build':
      return `The installed ${cause.harness_kind} build is now ${cause.version}, but Forge approved the tools of another build. Review the new build and approve its tools, then check again.`;
  }
}

/** The web path of the screen that fixes `cause`; a missing grant is a project setting, everything else is on the harness page. */
export function fixHrefFor(
  cause: SetupCause,
  projectSlug: string,
  harnessId: string,
): string {
  if (cause.type === 'login') {
    return `/settings/harnesses/${cause.harness_id}`;
  }

  if (cause.type === 'tool' && GRANT_REASONS.includes(cause.reason_code)) {
    return `/p/${projectSlug}/settings`;
  }

  return `/settings/harnesses/${harnessId}#tools`;
}

/** A setup is "still broken" in words the owner can use. */
export function stillBroken(cause: SetupCause): string {
  switch (cause.type) {
    case 'login':
      return `Forge still sees ${cause.harness_id} as signed out. Sign in, run its test in Settings, then check again.`;
    case 'tool':
      return `The tool ${cause.tool} is still not allowed (${cause.reason_code}). Fix it in Settings, then check again.`;
    case 'harness_build':
      return `The ${cause.harness_kind} build ${cause.version} has not passed its compatibility check yet.`;
  }
}

/** The answer text and option an owner's `answer` stands for, or the reason it cannot. */
export function resolveAnswer(
  payload: EscalationQuestion,
  body: Extract<EscalationActBody, { action: 'answer' }>,
): EscalationAnswer | string {
  if (body.option_id !== undefined) {
    const option = payload.options.find((o) => o.id === body.option_id);

    return option
      ? { action: 'answer', by: 'owner', text: option.label, option_id: option.id }
      : `the question has no option ${body.option_id}`;
  }

  return { action: 'answer', by: 'owner', text: body.text ?? '' };
}
