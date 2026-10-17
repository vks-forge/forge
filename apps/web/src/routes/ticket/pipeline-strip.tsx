/**
 * PipelineStrip: one chip per stage of the ticket's pipeline, with where it is and how many reworks it has used.
 *
 * Why: a ticket in a Standard or Full lane is no longer one Worker run and a gate: it goes
 *   through tests, an implementation, the gate, a review, maybe your sign-off. The owner wants
 *   the answer to "where is it and why is it not done" at a glance, on every tab of the ticket:
 *   which stages passed, which one runs now, which failed or waits, whether work went back for
 *   rework ("Rework 1 of 2", so the cap of two is never a surprise) and which checks a routing
 *   rule added. Status is a word and an icon, never colour alone. A chip opens the stage's detail
 *   in place. The strip follows the ticket: it refetches whenever the ticket changes and polls
 *   at the ticket's pace. Before the first dispatch there is no pipeline to show, and the strip
 *   says when it will start; it never shows an empty frame.
 *
 * Exports: PipelineStrip.
 * Depends on: react, lucide-react, api/use-ticket-pipeline, routes/ticket/stage-detail,
 *   components/status/state-panel, domain/stage-view-copy, schemas/pipelines.
 */

import {
  Check,
  CheckCheck,
  Circle,
  CircleAlert,
  CircleX,
  LoaderCircle,
  Minus,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useTicketPipeline } from '#/api/use-ticket-pipeline.js';
import { Button } from '#/components/ui/button.js';
import {
  NOT_STARTED,
  STATUS_VIEW,
  reworkBadge,
  ruleFor,
} from '#/domain/stage-view-copy.js';
import { StageDetail } from '#/routes/ticket/stage-detail.js';
import type { StageView } from '#/schemas/pipelines.js';

const ICON: Readonly<Record<StageView['status'], LucideIcon>> = {
  pending: Circle,
  running: LoaderCircle,
  passed: Check,
  failed: CircleX,
  error: CircleAlert,
  waiting: UserRound,
  skipped: Minus,
  adopted: CheckCheck,
};

const TONE = {
  good: 'border-good text-good',
  danger: 'border-danger bg-danger-soft text-fg',
  attn: 'border-attn bg-attn-soft text-fg',
  signal: 'border-signal text-fg',
  quiet: 'border-line text-muted',
} as const;

export function PipelineStrip(props: {
  slug: string;
  ticketId: string;
  /** Changes whenever the ticket does, so the strip refetches at once. */
  stamp: string;
}) {
  const { ticketId } = props;
  const query = useTicketPipeline(ticketId, props.stamp);
  const [openId, setOpenId] = useState<string | null>(null);

  if (query.isPending) {
    return (
      <div
        role="status"
        aria-label="Loading pipeline"
        className="h-11 w-full max-w-md shrink-0 animate-pulse rounded-lg bg-hover"
      />
    );
  }

  if (query.data === undefined) {
    return (
      <div
        role="alert"
        className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl bg-danger-soft p-3 text-sm"
      >
        <span>{`Could not load the pipeline. ${describeError(query.error).detail}`}</span>
        <Button
          onClick={() => void query.refetch()}
          status={query.isFetching ? 'loading' : 'idle'}
        >
          Try again
        </Button>
      </div>
    );
  }

  const pipeline = query.data;

  if (pipeline === null) {
    return <p className="shrink-0 text-xs text-muted">{NOT_STARTED}</p>;
  }

  const badge = reworkBadge(pipeline.rework);
  const open = pipeline.stages.find((s) => s.id === openId);
  const panelId = 'pipeline-stage-detail';

  return (
    <section aria-label="Pipeline" className="grid shrink-0 gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">Pipeline</h2>
        <span className="text-xs capitalize text-muted">{`${pipeline.lane} lane`}</span>
        {badge ? (
          <span className="rounded-md border border-attn bg-attn-soft px-1.5 py-0.5 text-xs font-medium">
            {badge}
          </span>
        ) : null}
      </div>

      <ol aria-label="Pipeline stages" className="flex flex-wrap gap-2">
        {pipeline.stages.map((stage) => {
          const status = STATUS_VIEW[stage.status];
          const Icon = ICON[stage.status];
          const rule = ruleFor(pipeline.routed, stage.id);
          const selected = stage.id === openId;

          return (
            <li key={stage.id}>
              <button
                type="button"
                aria-expanded={selected}
                aria-controls={selected ? panelId : undefined}
                onClick={() => setOpenId(selected ? null : stage.id)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1 text-left text-sm transition-colors hover:bg-hover ${TONE[status.tone]} ${
                  selected ? 'ring-2 ring-signal' : ''
                }`}
              >
                <Icon
                  aria-hidden="true"
                  className={`size-4 shrink-0 ${
                    stage.status === 'running' ? 'motion-safe:animate-spin' : ''
                  }`}
                />
                <span className="grid">
                  <span className="font-medium">{stage.label}</span>
                  <span className="text-xs">
                    {status.label}
                    {stage.cycle > 0 && stage.status !== 'pending'
                      ? `, round ${stage.cycle + 1}`
                      : ''}
                    {rule ? ', added by rule' : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {open ? (
        <StageDetail
          id={panelId}
          slug={props.slug}
          ticketId={ticketId}
          view={open}
          addedBy={ruleFor(pipeline.routed, open.id)?.rule_id}
        />
      ) : null}
    </section>
  );
}
