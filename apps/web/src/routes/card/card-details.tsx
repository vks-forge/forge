/**
 * CardDetails: the Details tab of the Card page, the facts about where a card came from.
 *
 * Why: the chat is about what to do; this tab answers "where did this come from, who made it
 *   and what may it cost" without making anyone dig through history. Source, creator, times and
 *   the budget cap (only when one is set; an absent cap is "No cap", never 0) are plain labelled
 *   facts. The Director's summary of the card is shown when it has written one, as text.
 *
 * Exports: CardDetails, SOURCE_LABEL.
 * Depends on: react, @forge/core (types), domain/format-time.
 */

import type { CardSourceKind } from '@forge/core';
import { formatWhen } from '#/domain/format-time.js';
import type { CardDetailReply } from '#/schemas/cards.js';

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

const ACTOR_LABEL: Readonly<Record<string, string>> = {
  user: 'You',
  director: 'The Director',
  github: 'GitHub',
  system: 'Forge',
  external: 'An outside system',
};

export function CardDetails(props: { card: CardDetailReply }) {
  const { card } = props;
  const creator = ACTOR_LABEL[card.created_by.type] ?? card.created_by.type;
  const rows: readonly [string, string][] = [
    ['Source', `${SOURCE_LABEL[card.source.kind]} · ${card.source.ref}`],
    ['Created by', `${creator} (${card.created_by.id})`],
    ['Created', formatWhen(card.created_at)],
    ['Last change', formatWhen(card.updated_at)],
    [
      'Budget cap',
      card.budget_cap_usd === undefined ? 'No cap' : `$${card.budget_cap_usd.toFixed(2)}`,
    ],
  ];

  return (
    <div className="grid max-w-xl gap-4">
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-0.5 sm:contents">
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {card.summary.trim() !== '' ? (
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold">Summary</h3>
          <p className="whitespace-pre-wrap break-words text-sm">{card.summary}</p>
        </div>
      ) : null}
    </div>
  );
}
