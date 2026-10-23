/**
 * DetailsTab: the facts about where a card came from and what it has cost.
 *
 * Why: the conversation is about what to do; this tab answers "where did this come from, who
 *   made it, what may it cost and what has it cost" without making anyone dig through history.
 *   Source, creator, times and the budget cap are plain labelled facts: the cap in force says
 *   whose it is (this card, the project or the Forge default) and what has been spent against it,
 *   "No cap" appears only when none applies (never 0), and the card's own cap can be set,
 *   changed or cleared here (it only warns). The Director's summary is shown when it has written one,
 *   as text. The cost breakdown lists the Director, each ticket and the total, with "not
 *   recorded" kept honest (components/cost/cost-breakdown).
 *
 * Exports: DetailsTab.
 * Depends on: react, components/card/budget-cap-field, components/cost/cost-breakdown, domain/card-source, domain/format-time,
 *   domain/stats-format, schemas/cards (type).
 */

import type { ReactNode } from 'react';
import { BudgetCapField } from '#/components/card/budget-cap-field.js';
import { CardCostBreakdown } from '#/components/cost/cost-breakdown.js';
import { ACTOR_LABEL, SOURCE_LABEL } from '#/domain/card-source.js';
import { formatWhen } from '#/domain/format-time.js';
import type { CardDetailReply } from '#/schemas/cards.js';

export function DetailsTab(props: { card: CardDetailReply }) {
  const { card } = props;
  const creator = ACTOR_LABEL[card.created_by.type] ?? card.created_by.type;
  const rows: readonly [string, ReactNode][] = [
    ['Source', `${SOURCE_LABEL[card.source.kind]} · ${card.source.ref}`],
    ['Created by', `${creator} (${card.created_by.id})`],
    ['Created', formatWhen(card.created_at)],
    ['Last change', formatWhen(card.updated_at)],
    [
      'Budget cap',
      <BudgetCapField
        key="cap"
        cardId={card.id}
        cap={card.budget_cap_usd}
        budget={card.budget}
        closed={card.closed_reason !== undefined}
      />,
    ],
  ];

  return (
    <div className="mx-auto grid max-w-3xl gap-8">
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-0.5 sm:contents">
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {card.summary.trim() !== '' ? (
        <section className="grid gap-1" aria-label="Summary">
          <h2 className="text-sm font-semibold">Summary</h2>
          <p className="whitespace-pre-wrap break-words text-sm">{card.summary}</p>
        </section>
      ) : null}
      <section className="grid gap-2" aria-label="Cost">
        <h2 className="text-sm font-semibold">Cost</h2>
        <CardCostBreakdown slug={card.project} cost={card.cost} />
      </section>
    </div>
  );
}
