/**
 * PipelineEditor: the ordered list of stages a lane's tickets go through, and the menu to add one.
 *
 * Why: how much process a ticket gets (tests first, an independent review, a critic, the
 *   owner's sign-off) is the owner's call per lane (d-0151, d-0152), and a list that quietly
 *   dropped the independent gate or let a reviewer approve its own work would let unchecked
 *   changes merge. The editor therefore edits a plain list (add a stage, move it, remove it,
 *   change the agent) while the shared rules in `domain/pipeline-edit` decide what each control
 *   may do, merge stays locked last and G1 pinned, and every problem core finds shows at once,
 *   in words, beside the row it concerns or above the list. It copies the planning-flow editor's
 *   shape on purpose, so the two lists feel like one product. Nothing is saved from here: edits
 *   are a draft until the lane's Save, and Discard puts the saved list back.
 *
 * Exports: PipelineEditor.
 * Depends on: react, components/pipelines/*, domain/pipeline-edit, @forge/core (types).
 */

import type { AgentView, PipelineDefinition, PipelineProblem } from '@forge/core';
import { AddStageMenu } from '#/components/pipelines/add-stage-menu.js';
import { PipelineProblems } from '#/components/pipelines/pipeline-problems.js';
import { StageRow } from '#/components/pipelines/stage-row.js';
import {
  addStage,
  moveStage,
  removeStage,
  replaceStage,
} from '#/domain/pipeline-edit.js';
import { indexProblems } from '#/domain/pipeline-inspect.js';

export function PipelineEditor(props: {
  label: string;
  def: PipelineDefinition;
  roster: readonly AgentView[];
  problems: readonly PipelineProblem[];
  warnings: readonly string[];
  checking: boolean;
  disabled?: boolean;
  onChange: (next: PipelineDefinition) => void;
}) {
  const { def } = props;
  const index = indexProblems(def, props.problems);

  return (
    <div className="grid gap-3">
      <PipelineProblems
        general={index.general}
        warnings={props.warnings}
        checking={props.checking}
      />

      <ol aria-label={`${props.label} stages`} className="grid gap-2">
        {def.stages.map((stage, at) => (
          <StageRow
            key={stage.id}
            stage={stage}
            position={at + 1}
            def={def}
            roster={props.roster}
            problems={index.byStage.get(stage.id) ?? []}
            onChange={(next) => props.onChange(replaceStage(def, next))}
            onMove={(direction) => props.onChange(moveStage(def, stage.id, direction))}
            onRemove={() => props.onChange(removeStage(def, stage.id))}
          />
        ))}
      </ol>

      <div>
        <AddStageMenu
          def={def}
          disabled={props.disabled ?? false}
          onAdd={(kind) => props.onChange(addStage(def, kind, props.roster))}
        />
      </div>
      <p className="text-xs text-muted">
        Stages run top to bottom. Writers go first, then the gate, then the checks; merge
        always comes last.
      </p>
    </div>
  );
}
