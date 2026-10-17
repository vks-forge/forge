/**
 * Card source and actor wording.
 *
 * Why: the Details tab and the header say where a card came from and who made it in plain
 *   words ("GitHub issue", "You"), never the raw enum, so the same labels live in one place.
 *
 * Exports: SOURCE_LABEL, ACTOR_LABEL.
 * Depends on: @forge/core (type). No IO.
 */

import type { CardSourceKind } from '@forge/core';

export const SOURCE_LABEL: Readonly<Record<CardSourceKind, string>> = {
  chat: 'Chat',
  github_issue: 'GitHub issue',
  github_pr: 'GitHub pull request',
  webhook: 'Webhook',
  cron: 'Schedule',
  telemetry: 'Telemetry',
  bug_report: 'Bug report',
  legacy: 'Imported',
};

export const ACTOR_LABEL: Readonly<Record<string, string>> = {
  user: 'You',
  director: 'The Director',
  github: 'GitHub',
  system: 'Forge',
  external: 'An outside system',
};
