/**
 * Director override rules: how a project departs from the company's Director settings.
 *
 * Why: a project stores only the Director settings it changed (d-0085), as a partial
 *   `director` section. Turning one setting's override on copies the company value in as the
 *   starting point; turning it off removes the key so the project follows later company
 *   changes again; "Reset to company" removes them all. A number edited inside a group (one
 *   timeout among eleven) must write the whole group, since the stored section replaces its
 *   keys, so the edit starts from what the project currently sees. And a save must be refused
 *   in the page, in words, when the flow breaks a locked rule or a limit is not a positive
 *   number, before the server has to say so.
 *
 * Exports: directorDraftOf(), withDirectorValue(), toggleDirectorKey(), setDirectorPath(),
 *   directorIssues().
 * Depends on: @forge/core (types), domain/config-path, domain/director-flow-edit,
 *   types/director-ui.types, types/project-settings.types. Pure.
 */

import type { DirectorConfig } from '@forge/core';
import { setAt } from '#/domain/config-path.js';
import { flowIssues } from '#/domain/director-flow-edit.js';
import type { DirectorOverrideValue } from '#/types/director-ui.types.js';
import type { FieldDraft } from '#/types/project-settings.types.js';

/** The editor state for a stored override: overridden exactly when it names at least one key. */
export function withDirectorValue(
  value: DirectorOverrideValue,
): FieldDraft<DirectorOverrideValue> {
  return { overridden: Object.keys(value).length > 0, value };
}

export function directorDraftOf(override: unknown): FieldDraft<DirectorOverrideValue> {
  const stored =
    typeof override === 'object' && override !== null && !Array.isArray(override)
      ? (override as DirectorOverrideValue)
      : {};

  return withDirectorValue(stored);
}

/** One setting's override switched on (starting from the company value) or off (key removed). */
export function toggleDirectorKey(
  value: DirectorOverrideValue,
  key: keyof DirectorConfig,
  on: boolean,
  inherited: DirectorConfig,
): DirectorOverrideValue {
  if (!on) {
    return Object.fromEntries(
      Object.entries(value).filter(([name]) => name !== key),
    ) as DirectorOverrideValue;
  }

  return { ...value, [key]: inherited[key] };
}

/**
 * The override after editing the value at `path` (`director.grill.max_rounds`). The section
 * is written whole, from what the project sees now, with the one leaf changed.
 */
export function setDirectorPath(
  seen: DirectorConfig,
  value: DirectorOverrideValue,
  path: string,
  leaf: unknown,
): DirectorOverrideValue {
  const [, section, ...rest] = path.split('.');
  if (section === undefined) {
    return value;
  }

  const key = section as keyof DirectorConfig;
  const current = seen[key];
  const next = rest.length === 0 ? leaf : setAt(current, rest.join('.'), leaf);

  return { ...value, [key]: next };
}

const positive = (n: unknown): boolean =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

const whole = (n: unknown): boolean => positive(n) && Number.isInteger(n);

/** Messages for everything in the override that the server would refuse. */
export function directorIssues(
  seen: DirectorConfig,
  value: DirectorOverrideValue,
): string[] {
  const out: string[] = [];

  if (value.flow) {
    out.push(...flowIssues(value.flow, seen.playbooks).map((i) => i.message));
  }

  if (
    value.grill &&
    !(whole(seen.grill.max_questions_per_round) && whole(seen.grill.max_rounds))
  ) {
    out.push('Question limits must be whole numbers of 1 or more.');
  }

  if (value.budget_warning_usd !== undefined && !positive(seen.budget_warning_usd)) {
    out.push('The budget warning must be more than 0.');
  }

  if (
    value.read_caps &&
    !(whole(seen.read_caps.max_files) && whole(seen.read_caps.max_bytes))
  ) {
    out.push('Read caps must be whole numbers of 1 or more.');
  }

  if (value.research) {
    const r = seen.research;
    const within = (n: number, lo: number, hi: number): boolean =>
      Number.isInteger(n) && n >= lo && n <= hi;

    if (!(
      within(r.max_rounds, 1, 10) &&
      within(r.max_searches, 0, 100) &&
      within(r.max_fetches, 0, 100) &&
      within(r.max_bytes, 50_000, 20_000_000) &&
      within(r.max_runs_per_card, 1, 100)
    )) {
      out.push(
        'Research needs 1 to 10 rounds, 0 to 100 searches and pages, 50 to 20000 KB and 1 to 100 runs per card, all whole numbers.',
      );
    }

    if (r.step_budget_usd !== undefined && !positive(r.step_budget_usd)) {
      out.push('The research call budget must be more than 0, or left empty.');
    }
  }

  if (value.memory) {
    const m = seen.memory;
    const within = (n: number, lo: number, hi: number): boolean =>
      Number.isInteger(n) && n >= lo && n <= hi;

    if (!(
      within(m.rewrite_timeout_ms, 1000, 60_000) &&
      within(m.top_k, 1, 15) &&
      within(m.pinned_max, 0, 25) &&
      within(m.rejected_max, 5, 50)
    )) {
      out.push(
        'Memory needs a rewrite timeout of 1 to 60 seconds, 1 to 15 relevant decisions, 0 to 25 pinned and 5 to 50 rejected approaches, all whole numbers.',
      );
    }

    if (!(
      Number.isFinite(m.rewrite_budget_usd) &&
      m.rewrite_budget_usd >= 0 &&
      m.rewrite_budget_usd <= 2
    )) {
      out.push('The rewrite budget must be between 0 and 2 USD.');
    }
  }

  if (
    value.escalation &&
    !(
      seen.escalation.answer_confidence >= 0 &&
      seen.escalation.answer_confidence <= 1 &&
      Number.isInteger(seen.escalation.max_director_retries) &&
      seen.escalation.max_director_retries >= 0
    )
  ) {
    out.push(
      'Answer confidence must be between 0 and 1, and retries a whole number of 0 or more.',
    );
  }

  if (value.pipelines) {
    const {
      propose_after: after,
      propose_min_cards: cards,
      propose_window_days: days,
    } = seen.pipelines;

    const within = (n: number, lo: number, hi: number): boolean =>
      Number.isInteger(n) && n >= lo && n <= hi;

    if (!(within(after, 2, 10) && within(cards, 1, 5) && within(days, 7, 90))) {
      out.push(
        'Suggestions need 2 to 10 tickets, 1 to 5 cards and 7 to 90 days, all whole numbers.',
      );
    }
  }

  if (value.step_timeouts_ms && !Object.values(seen.step_timeouts_ms).every(whole)) {
    out.push('Every step timeout must be a whole number of 1 or more.');
  }

  return out;
}
