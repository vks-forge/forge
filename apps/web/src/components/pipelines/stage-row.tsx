/**
 * StageRow: one stage of a lane's pipeline, with its order controls, its summary and its problems.
 *
 * Why: the owner reshapes a lane with buttons they can reach by keyboard, so every row has move
 *   up, move down and remove as real buttons named for the stage ("Move Review up"). A control
 *   that cannot be used says why (first in the list, merge must stay last) instead of silently
 *   doing nothing. Merge and G1 show a lock and the reason, and offer no buttons: merge ends
 *   every pipeline and G1 is the independent gate nobody may skip (d-0006). Each row says in one
 *   line what the stage is (the agent and its role, the command, the people it asks) and shows
 *   the problems core found for it, in words, right under it where the owner is looking, and the
 *   server's notes (a critic on the Worker's own model family) as a labelled line. The Director
 *   check and the sign-off say what they do and, for the sign-off, who signs.
 *
 * Exports: StageRow.
 * Depends on: react, lucide-react, components/pipelines/stage-details, components/ui/*,
 *   domain/{agent-copy,pipeline-copy,pipeline-edit}, @forge/core (types).
 */

import {
  Bot,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  GitMerge,
  Layers,
  Lock,
  ShieldCheck,
  Stamp,
  Terminal,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useState } from 'react';
import type { AgentView, PipelineDefinition, PipelineProblem, Stage } from '@forge/core';
import { useLaneId } from '#/components/pipelines/lane-ids.js';
import { StageDetails } from '#/components/pipelines/stage-details.js';
import { IconButton } from '#/components/ui/icon-button.js';
import { Tooltip } from '#/components/ui/tooltip.js';
import { ROLE_INFO } from '#/domain/agent-copy.js';
import { KIND_LABEL, problemWords } from '#/domain/pipeline-copy.js';
import { LOCK_REASONS, moveAction, removeAction } from '#/domain/pipeline-edit.js';
import type { StageMove } from '#/types/pipeline-ui.types.js';

const isG1 = (s: Stage): boolean => s.kind === 'script_gate' && 'builtin' in s.run;

const ICON = 'size-4 shrink-0 text-muted';

function StageIcon(props: { stage: Stage }) {
  const { stage } = props;

  switch (stage.kind) {
    case 'agent':
      return <Bot aria-hidden="true" className={ICON} />;
    case 'script_gate':
      return isG1(stage) ? (
        <ShieldCheck aria-hidden="true" className={ICON} />
      ) : (
        <Terminal aria-hidden="true" className={ICON} />
      );
    case 'group':
      return <Layers aria-hidden="true" className={ICON} />;
    case 'human':
      return <UserCheck aria-hidden="true" className={ICON} />;
    case 'director_check':
      return <ClipboardCheck aria-hidden="true" className={ICON} />;
    case 'sign_off':
      return <Stamp aria-hidden="true" className={ICON} />;
    case 'merge':
      return <GitMerge aria-hidden="true" className={ICON} />;
  }
}

function summary(stage: Stage, roster: readonly AgentView[]): string {
  const name = (id: string): string =>
    roster.find((a) => a.id === id)?.definition.name ??
    (id === '' ? 'no agent chosen' : id);

  switch (stage.kind) {
    case 'agent': {
      const role = roster.find((a) => a.id === stage.agent)?.definition.role;

      return `${name(stage.agent)}${role ? `, ${ROLE_INFO[role].label.toLowerCase()}` : ''}${stage.proof ? ', must fail first' : ''}`;
    }

    case 'script_gate':
      return 'builtin' in stage.run
        ? 'Required after the last writer'
        : stage.run.command === ''
          ? 'No command yet'
          : stage.run.command;
    case 'group':
      return `Run together: ${stage.members
        .map((m) => (m.kind === 'agent' ? name(m.agent) : m.label))
        .join(', ')}`;
    case 'human':
      return 'Waits for your approval';
    case 'director_check':
      return stage.on_blocking === 'rework'
        ? 'Compares the work with the plan; findings send it back'
        : 'Compares the work with the plan; findings hold it for you';
    case 'sign_off':
      return stage.signer === 'owner'
        ? 'Always you'
        : 'Director signs when every check passed, otherwise you';
    case 'merge':
      return 'Always last';
  }
}

export function StageRow(props: {
  stage: Stage;
  position: number;
  def: PipelineDefinition;
  roster: readonly AgentView[];
  problems: readonly PipelineProblem[];
  /** The server's notes for this row, such as a critic on the Worker's own model family. */
  warnings: readonly string[];
  onChange: (next: Stage) => void;
  onMove: (direction: StageMove) => void;
  onRemove: () => void;
}) {
  const { stage, def } = props;
  const [open, setOpen] = useState(false);
  const detailsId = useLaneId(`stage-${stage.id}-details`);
  const locked = stage.kind === 'merge' || isG1(stage);
  const lockReason = stage.kind === 'merge' ? LOCK_REASONS.merge : LOCK_REASONS.g1;
  const up = moveAction(def, stage.id, -1);
  const down = moveAction(def, stage.id, 1);
  const remove = removeAction(def, stage.id);

  return (
    <li
      aria-label={stage.label}
      className={`rounded-lg border ${
        props.problems.length > 0 ? 'border-danger' : 'border-line'
      } ${locked ? 'bg-hover' : 'bg-surface'}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <span
          aria-hidden="true"
          className="w-5 shrink-0 text-center font-data text-xs text-muted"
        >
          {props.position}
        </span>
        <StageIcon stage={stage} />
        <div className="min-w-40 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {locked ? (
              <Tooltip content={lockReason}>
                <span
                  role="img"
                  aria-label={lockReason}
                  className="inline-flex text-muted"
                >
                  <Lock aria-hidden="true" className="size-3.5" />
                </span>
              </Tooltip>
            ) : null}
            {stage.label}
          </p>
          <p className="truncate text-xs text-muted">
            {KIND_LABEL[stage.kind]}
            {' · '}
            <span
              className={stage.kind === 'script_gate' && !isG1(stage) ? 'font-data' : ''}
            >
              {summary(stage, props.roster)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {locked ? null : (
            <>
              <IconButton
                label={`Move ${stage.label} up`}
                blockedReason={up.ok ? undefined : up.reason}
                onClick={() => props.onMove(-1)}
              >
                <ChevronUp aria-hidden="true" className="size-4" />
              </IconButton>
              <IconButton
                label={`Move ${stage.label} down`}
                blockedReason={down.ok ? undefined : down.reason}
                onClick={() => props.onMove(1)}
              >
                <ChevronDown aria-hidden="true" className="size-4" />
              </IconButton>
              <IconButton
                label={`Remove ${stage.label}`}
                blockedReason={remove.ok ? undefined : remove.reason}
                onClick={props.onRemove}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            </>
          )}
          <button
            type="button"
            aria-label={`${open ? 'Hide details' : 'Details'} for ${stage.label}`}
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen(!open)}
            className="min-h-9 rounded-lg px-2 text-sm text-muted hover:bg-hover hover:text-fg"
          >
            {open ? 'Hide details' : 'Details'}
          </button>
        </div>
      </div>

      {open ? (
        <div id={detailsId}>
          <StageDetails
            stage={stage}
            def={def}
            roster={props.roster}
            onChange={props.onChange}
          />
        </div>
      ) : null}

      {props.warnings.length > 0 ? (
        <ul className="grid gap-1 border-t border-line px-3 py-2">
          {props.warnings.map((warning) => (
            <li key={warning} role="note" className="text-xs">
              <span className="mr-1.5 rounded-md border border-attn bg-attn-soft px-1.5 py-0.5 font-medium">
                Note
              </span>
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      {props.problems.length > 0 ? (
        <ul className="grid gap-1 border-t border-line px-3 py-2">
          {props.problems.map((problem) => (
            <li
              key={`${problem.code}-${problem.stage_id ?? ''}-${problem.message}`}
              role="alert"
              className="text-xs text-danger"
            >
              {problemWords(problem)}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
