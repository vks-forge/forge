/**
 * FlowStepRow: one step of the planning flow, with its order, switch and remove controls.
 *
 * Why: the owner reshapes the flow with buttons they can reach by keyboard, so each row has
 *   move up, move down and remove as real buttons named for the step ("Move Survey the
 *   repository up"). A control that cannot be used says why (first in the list, would pass the
 *   locked steps) instead of silently doing nothing. Locked steps show a lock and a
 *   tooltip with the reason, and their order, switch and removal are not offered at all: those
 *   steps carry the approval rules (d-0146). Problems with this step show under it, in words.
 *
 * Exports: FlowStepRow.
 * Depends on: react, lucide-react, components/director/flow-step-details, components/ui/*,
 *   domain/director-flow-edit, types/director-ui.types.
 */

import type { FlowStep } from '@forge/core';
import { ChevronDown, ChevronUp, Lock, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { FlowStepDetails, whenWords } from '#/components/director/flow-step-details.js';
import { Switch } from '#/components/ui/field.js';
import { Tooltip } from '#/components/ui/tooltip.js';
import { LOCKED_REASON } from '#/domain/director-flow-edit.js';
import type { FlowIssue, StepAction } from '#/types/director-ui.types.js';

function IconButton(props: {
  label: string;
  action?: StepAction;
  onClick: () => void;
  children: ReactNode;
}) {
  const blocked = props.action !== undefined && !props.action.ok;
  const reason = props.action && !props.action.ok ? props.action.reason : props.label;

  return (
    <Tooltip content={reason}>
      <span className="inline-flex">
        <button
          type="button"
          aria-label={props.label}
          disabled={blocked}
          onClick={props.onClick}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-fg transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface"
        >
          {props.children}
        </button>
      </span>
    </Tooltip>
  );
}

export function FlowStepRow(props: {
  step: FlowStep;
  position: number;
  up: StepAction;
  down: StepAction;
  issues: readonly FlowIssue[];
  onChange: (change: Partial<Omit<FlowStep, 'id' | 'kind' | 'locked'>>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { step } = props;
  const [open, setOpen] = useState(false);
  const detailsId = `flow-${step.id}-details`;

  return (
    <li
      aria-label={step.label}
      className={`rounded-lg border ${
        props.issues.length > 0 ? 'border-danger' : 'border-line'
      } ${step.locked ? 'bg-hover' : 'bg-surface'}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <span
          aria-hidden="true"
          className="w-5 shrink-0 text-center font-data text-xs text-muted"
        >
          {props.position}
        </span>
        <div className="min-w-40 flex-1">
          <p
            className={`flex items-center gap-1.5 text-sm font-medium ${
              step.enabled ? '' : 'text-muted line-through'
            }`}
          >
            {step.locked ? (
              <Tooltip content={LOCKED_REASON}>
                <span
                  role="img"
                  aria-label={LOCKED_REASON}
                  className="inline-flex text-muted"
                >
                  <Lock aria-hidden="true" className="size-3.5" />
                </span>
              </Tooltip>
            ) : null}
            {step.label}
          </p>
          <p className="text-xs text-muted">
            {step.kind.replace('_', ' ')}, runs {whenWords(step)}
            {step.enabled ? '' : ', switched off'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {step.locked ? null : (
            <>
              <Switch
                checked={step.enabled}
                label={`Run ${step.label}`}
                onChange={(enabled) => props.onChange({ enabled })}
              />
              <IconButton
                label={`Move ${step.label} up`}
                action={props.up}
                onClick={() => props.onMove(-1)}
              >
                <ChevronUp aria-hidden="true" className="size-4" />
              </IconButton>
              <IconButton
                label={`Move ${step.label} down`}
                action={props.down}
                onClick={() => props.onMove(1)}
              >
                <ChevronDown aria-hidden="true" className="size-4" />
              </IconButton>
              <IconButton label={`Remove ${step.label}`} onClick={props.onRemove}>
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            </>
          )}
          <button
            type="button"
            aria-label={`${open ? 'Hide details' : 'Details'} for ${step.label}`}
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
          <FlowStepDetails step={step} onChange={props.onChange} />
        </div>
      ) : null}

      {props.issues.length > 0 ? (
        <ul className="grid gap-1 border-t border-line px-3 py-2">
          {props.issues.map((issue) => (
            <li key={issue.message} role="alert" className="text-xs text-danger">
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
