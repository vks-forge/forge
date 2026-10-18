/**
 * PipelineStrip: one chip per stage of the ticket's pipeline, with where it is and how many reworks it has used.
 *
 * Why: a ticket in a Standard or Full lane is no longer one Worker run and a gate: it goes
 *   through tests, an implementation, the gate, a review, maybe your sign-off. The owner wants
 *   the answer to "where is it and why is it not done" at a glance, on every tab of the ticket:
 *   which stages passed, which one runs now, which failed or waits, whether work went back for
 *   rework ("Rework 1 of 2", so the cap of two is never a surprise) and which checks a routing
 *   rule added. Status is a word and an icon, never colour alone. A chip opens the stage's detail
 *   in place. The strip follows the ticket: the server announces every stage write on the project
 *   stream and the strip refetches at once (api/use-ticket-pipeline), with a slow poll behind it.
 *   The Director check and the sign-off are stages of their own, and the members of a group sit
 *   side by side inside a dashed frame so "run together" is visible. Before the first dispatch there is no pipeline to show, and the strip
 *   says when it will start; it never shows an empty frame.
 *
 * Exports: PipelineStrip.
 * Depends on: react, api/use-ticket-pipeline, routes/ticket/{stage-chip,stage-detail},
 *   components/status/state-panel, domain/stage-view-copy, schemas/pipelines.
 */

import { useState } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useTicketPipeline } from '#/api/use-ticket-pipeline.js';
import { Button } from '#/components/ui/button.js';
import {
  NOT_STARTED,
  findStage,
  reworkBadge,
  ruleFor,
} from '#/domain/stage-view-copy.js';
import { StageChip } from '#/routes/ticket/stage-chip.js';
import { StageDetail } from '#/routes/ticket/stage-detail.js';
import type { StageView } from '#/schemas/pipelines.js';

export function PipelineStrip(props: { slug: string; ticketId: string }) {
  const { ticketId } = props;
  const query = useTicketPipeline(ticketId);
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
  const open = openId === null ? undefined : findStage(pipeline.stages, openId);
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

      <ol aria-label="Pipeline stages" className="flex flex-wrap items-start gap-2">
        {pipeline.stages.map((stage) => {
          const chip = (member: StageView) => (
            <StageChip
              stage={member}
              selected={member.id === openId}
              panelId={panelId}
              addedByRule={ruleFor(pipeline.routed, member.id) !== undefined}
              onToggle={() => setOpenId(member.id === openId ? null : member.id)}
            />
          );

          return (
            <li key={stage.id}>
              {stage.members === undefined ? (
                chip(stage)
              ) : (
                <div
                  role="group"
                  aria-label={stage.label}
                  className="grid gap-1 rounded-xl border border-dashed border-line p-1.5"
                >
                  <p className="px-1 text-xs text-muted">{`${stage.label} · together`}</p>
                  <ul className="flex flex-wrap gap-2">
                    {stage.members.map((member) => (
                      <li key={member.id}>{chip(member)}</li>
                    ))}
                  </ul>
                </div>
              )}
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
