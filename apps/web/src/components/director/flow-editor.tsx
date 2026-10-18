/**
 * FlowEditor: the ordered list of steps the Director plans a card with, and the form to add one.
 *
 * Why: how much grilling, checking and enhancing a card gets is the owner's call (d-0146), and
 *   a flow that quietly skipped the write-plan or approve step would break the approval rules.
 *   The editor therefore edits a plain list (switch a step off, move it, give it a condition,
 *   add a custom step or the one Research step) while the shared rules in `domain/director-flow-edit` decide what each
 *   control may do, and a problem anywhere in the list shows at once, before saving, in words.
 *   Nothing is saved from here: edits are a draft until the page's Save, and Discard puts the
 *   saved flow back.
 *
 * Exports: FlowEditor.
 * Depends on: react, components/director/*, components/settings/form-field,
 *   components/ui/button, domain/director-flow-edit.
 */

import type { FlowStep } from '@forge/core';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { AddStepForm } from '#/components/director/add-step-form.js';
import { FlowStepRow } from '#/components/director/flow-step-row.js';
import { Notice } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import {
  addCustomStep,
  addResearchStep,
  flowIssues,
  hasResearchStep,
  RESEARCH_PRESENT_REASON,
  moveStep,
  patchStep,
  removeStep,
  stepAction,
} from '#/domain/director-flow-edit.js';

export function FlowEditor(props: {
  flow: readonly FlowStep[];
  playbooks?: Readonly<Record<string, unknown>>;
  onChange: (flow: FlowStep[]) => void;
}) {
  const { flow } = props;
  const [adding, setAdding] = useState(false);
  const issues = flowIssues(flow, props.playbooks);
  const general = issues.filter((i) => i.stepId === undefined);
  const researching = hasResearchStep(flow);

  return (
    <div className="grid gap-3">
      {general.length > 0 ? (
        <Notice tone="error" title="This flow cannot be saved yet">
          <ul className="list-disc pl-4">
            {general.map((issue) => (
              <li key={issue.message}>{issue.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <ol aria-label="Planning flow" className="grid gap-2">
        {flow.map((step, at) => (
          <FlowStepRow
            key={step.id}
            step={step}
            position={at + 1}
            up={stepAction(flow, step.id, -1)}
            down={stepAction(flow, step.id, 1)}
            issues={issues.filter((i) => i.stepId === step.id)}
            onChange={(change) => props.onChange(patchStep(flow, step.id, change))}
            onMove={(direction) => props.onChange(moveStep(flow, step.id, direction))}
            onRemove={() => props.onChange(removeStep(flow, step.id))}
          />
        ))}
      </ol>

      {adding ? (
        <AddStepForm
          onCancel={() => setAdding(false)}
          onAdd={(input) => {
            props.onChange(addCustomStep(flow, input));
            setAdding(false);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Add custom step
          </Button>
          <div className="grid gap-1">
            <Button
              disabled={researching}
              aria-describedby="add-research-note"
              onClick={() => props.onChange(addResearchStep(flow))}
            >
              <Plus aria-hidden="true" className="size-4" />
              Add Research step
            </Button>
            <p id="add-research-note" className="max-w-xs text-xs text-muted">
              {researching
                ? RESEARCH_PRESENT_REASON
                : 'New: looks up outside facts before the plan is written.'}
            </p>
          </div>
        </div>
      )}
      <p className="text-xs text-muted">
        Steps run top to bottom. New steps are added before the locked “Write the plan”
        and “Approve the plan” steps, which always stay last.
      </p>
    </div>
  );
}
