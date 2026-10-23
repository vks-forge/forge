/**
 * CardCostBreakdown and TicketCostBreakdown: where the money went, line by line.
 *
 * Why: the header shows one small figure; the owner who wonders "why $4?" needs the parts. A
 *   card's cost is the Director's own steps (planning, chat turns, escalation answers) plus the
 *   runs of each of its tickets, so the table lists the Director, every ticket (a link to it,
 *   highest spend first) and the total. A ticket's cost is its runs, oldest first. Honesty
 *   rules: a run whose harness reported no cost is "not recorded" with the reason on hover,
 *   never `$0.00`, and the table says that only recorded cost is counted, because triage and
 *   steering steps and failed model calls are not, so the total is a floor. A server that sent
 *   no cost at all says so instead of showing zeros. Each table opens with the one-line split
 *   every screen uses (total, then "Workers $a · Director $b"), and the Director row says once
 *   in words what the Director is ("planning and answering"); a ticket's own table carries its
 *   Director row too, so its total adds up.
 *
 * Exports: CardCostBreakdown, TicketCostBreakdown.
 * Depends on: react, @forge/core (types), components/cost/cost-chip, components/ticket/*,
 *   domain/cost-display, domain/stats-format.
 */

import type { CardCost, TicketCost } from '@forge/core';
import { CostChip } from '#/components/cost/cost-chip.js';
import { RunChip } from '#/components/ticket/status-chips.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { COST_FLOOR_NOTE, costText, splitLine } from '#/domain/cost-display.js';

const TABLE = 'w-full max-w-2xl text-sm';
const HEAD = 'pb-1.5 text-left text-xs font-medium text-muted';
const ROW = 'border-t border-line';
const MONEY = 'py-2 text-right';

/** `$24.29 in total · Workers $7.43 · Director $16.86`, the same split everywhere. */
function SplitSummary(props: { total: number; workers: number; director: number }) {
  return (
    <p className="text-sm">
      <span className="font-data font-medium tabular-nums">{costText(props.total)}</span>{' '}
      <span className="text-muted">
        in total ·{' '}
        <span className="font-data">{splitLine(props.workers, props.director)}</span>
      </span>
    </p>
  );
}

function Unavailable() {
  return (
    <p className="text-sm text-muted">
      This server did not send a cost for this item, so none is shown.
    </p>
  );
}

export function CardCostBreakdown(props: { slug: string; cost: CardCost | undefined }) {
  const { cost } = props;
  if (cost === undefined) {
    return <Unavailable />;
  }

  return (
    <div className="grid gap-2">
      <SplitSummary
        total={cost.total_usd}
        workers={cost.tickets_usd}
        director={cost.director_usd}
      />
      <table className={TABLE}>
        <caption className="sr-only">Cost of this card</caption>
        <thead>
          <tr>
            <th scope="col" className={HEAD}>
              Part
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Cost
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className={ROW}>
            <th scope="row" className="py-2 text-left font-normal">
              Director (planning and answering)
              <span className="block text-xs text-muted">
                Planning, chat and escalation answers
              </span>
            </th>
            <td className={MONEY}>
              <CostChip
                usd={cost.director_usd}
                recorded={cost.director_usd > 0}
                label="Director cost"
              />
            </td>
          </tr>
          {cost.by_ticket.map((row) => (
            <tr key={row.ticket_id} className={ROW}>
              <th scope="row" className="min-w-0 py-2 text-left font-normal">
                <TicketLink id={row.ticket_id} slug={props.slug} />
                <span className="block break-words text-xs text-muted">{row.title}</span>
              </th>
              <td className={MONEY}>
                <CostChip
                  usd={row.usd}
                  recorded={row.usd > 0}
                  label={`Cost of ${row.ticket_id}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line font-medium">
            <th scope="row" className="py-2 text-left font-medium">
              Total
            </th>
            <td className={MONEY}>
              <CostChip
                usd={cost.total_usd}
                recorded={cost.total_usd > 0}
                label="Total cost"
                className="text-fg"
              />
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="max-w-2xl text-xs text-muted">{COST_FLOOR_NOTE}</p>
    </div>
  );
}

export function TicketCostBreakdown(props: { cost: TicketCost | undefined }) {
  const { cost } = props;
  if (cost === undefined) {
    return <Unavailable />;
  }

  if (cost.by_run.length === 0 && cost.director_usd === 0) {
    return (
      <p className="text-sm text-muted">
        No Worker has run on this ticket, so nothing was spent.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <SplitSummary
        total={cost.total_usd}
        workers={cost.workers_usd}
        director={cost.director_usd}
      />
      <table className={TABLE}>
        <caption className="sr-only">Cost of this ticket by run</caption>
        <thead>
          <tr>
            <th scope="col" className={HEAD}>
              Run
            </th>
            <th scope="col" className={HEAD}>
              Status
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Cost
            </th>
          </tr>
        </thead>
        <tbody>
          {cost.by_run.map((run) => (
            <tr key={run.run_id} className={ROW}>
              <th scope="row" className="py-2 text-left font-data text-xs font-normal">
                {run.run_id}
              </th>
              <td className="py-2">
                <RunChip status={run.status} />
              </td>
              <td className={MONEY}>
                <CostChip
                  usd={run.usd}
                  recorded={run.recorded}
                  label={`Cost of ${run.run_id}`}
                />
              </td>
            </tr>
          ))}
          {cost.director_usd > 0 ? (
            <tr className={ROW}>
              <th scope="row" colSpan={2} className="py-2 text-left font-normal">
                Director (planning and answering)
                <span className="block text-xs text-muted">
                  Answers to this ticket's questions, recovery and checks
                </span>
              </th>
              <td className={MONEY}>
                <CostChip usd={cost.director_usd} label="Director cost of this ticket" />
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t border-line font-medium">
            <th scope="row" colSpan={2} className="py-2 text-left font-medium">
              Total
            </th>
            <td className={MONEY}>
              <CostChip
                usd={cost.total_usd}
                recorded={
                  cost.by_run.some((run) => run.recorded) || cost.director_usd > 0
                }
                label="Total cost"
                className="text-fg"
              />
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="max-w-2xl text-xs text-muted">{COST_FLOOR_NOTE}</p>
    </div>
  );
}
