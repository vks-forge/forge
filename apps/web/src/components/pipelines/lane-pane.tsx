/**
 * LanePane: one lane of one scope: what it is, where its pipeline comes from, the editor, Reset and Save.
 *
 * Why: a lane is the unit an owner changes and the unit a version records, so everything that
 *   belongs to one lane sits together: a header saying what the lane is for and whether its
 *   pipeline is the built-in one, edited, or (in a project) changed from the company default;
 *   the editor; a save bar with its own reason; and Reset, which puts the lane back to the
 *   built-in (company) or the company default (project) and asks first because it discards the
 *   current list. Full is editable now but cannot run until its runner ships, and the header
 *   says so, so an owner never wonders why a Full ticket sits waiting. When two people save at
 *   once the conflict banner decides; saving is paused until it is answered.
 *
 * Exports: LanePane.
 * Depends on: react, lucide-react, components/pipelines/*, components/settings/form-field,
 *   components/ui/*, domain/pipeline-copy, state/use-pipeline-editor, @forge/core (types).
 */

import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { AgentView, Lane } from '@forge/core';
import { LaneIdProvider } from '#/components/pipelines/lane-ids.js';
import { PipelineConflictBanner } from '#/components/pipelines/pipeline-conflict-banner.js';
import { PipelineEditor } from '#/components/pipelines/pipeline-editor.js';
import { PipelineSaveBar } from '#/components/pipelines/pipeline-save-bar.js';
import { Notice } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { Tooltip } from '#/components/ui/tooltip.js';
import { LANE_BLURB, LANE_LABEL, tagWords } from '#/domain/pipeline-copy.js';
import { REASON_MIN, usePipelineEditor } from '#/state/use-pipeline-editor.js';
import type { PipelineList, PipelineScope } from '#/types/pipeline-api.types.js';

const TONE = {
  plain: 'border-line text-muted',
  attn: 'border-attn bg-attn-soft text-fg',
} as const;

export function LanePane(props: {
  scope: PipelineScope;
  lane: Lane;
  list: PipelineList;
  roster: readonly AgentView[];
}) {
  const { scope, lane } = props;
  const editor = usePipelineEditor({
    scope,
    lane,
    list: props.list,
    roster: props.roster,
  });

  const [confirming, setConfirming] = useState(false);
  const [why, setWhy] = useState('');
  const company = scope.kind === 'company';
  const name = LANE_LABEL[lane];
  const tag = tagWords(editor.view.tags, scope.kind);
  const resetTarget = company ? 'the built-in pipeline' : 'the company default';
  const whyOk = why.trim().length >= REASON_MIN;

  return (
    <LaneIdProvider lane={lane}>
      <div className="grid gap-4">
        <header className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{`${name} pipeline`}</h3>
            <span
              className={`whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium ${TONE[tag.tone]}`}
            >
              {tag.label}
            </span>
            <div className="ml-auto">
              <Tooltip content={`Already ${resetTarget}.`} disabled={editor.canReset}>
                <span className="inline-flex">
                  <Button
                    disabled={!editor.canReset}
                    status={editor.resetting ? 'loading' : 'idle'}
                    onClick={() => {
                      editor.clearResetError();
                      setConfirming(true);
                    }}
                  >
                    <RotateCcw aria-hidden="true" className="size-4" />
                    {`Reset ${name}`}
                  </Button>
                </span>
              </Tooltip>
            </div>
          </div>
          <p className="max-w-prose text-sm text-muted">{LANE_BLURB[lane]}</p>
        </header>

        {editor.resetError ? (
          <Notice tone="error" title={editor.resetError.title}>
            {editor.resetError.detail}
          </Notice>
        ) : null}

        {editor.conflict ? (
          <PipelineConflictBanner
            subject={`The ${name} pipeline`}
            from={editor.conflict.from}
            to={editor.conflict.to}
            onKeep={editor.keepMine}
            onReload={editor.reload}
          />
        ) : null}

        <PipelineEditor
          label={name}
          def={editor.draft}
          roster={props.roster}
          problems={editor.problems}
          warnings={editor.warnings}
          checking={editor.checking}
          disabled={editor.saving}
          onChange={editor.setDraft}
        />

        <PipelineSaveBar
          idPrefix={`pipeline-${lane}`}
          subject={`the ${name} pipeline`}
          saveLabel={company ? `Save ${name}` : `Save ${name} for this project`}
          version={editor.version}
          dirty={editor.dirty}
          reason={editor.reason}
          onReason={editor.setReason}
          hold={editor.hold}
          saving={editor.saving}
          error={editor.error}
          saved={editor.saved}
          onSave={editor.save}
          onDiscard={editor.discard}
        />

        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Reset the ${name} pipeline?`}
          description={`The ${name} lane goes back to ${resetTarget}.${
            editor.dirty ? ' The changes you have not saved are lost.' : ''
          } Tickets already started keep the pipeline they began with.`}
          confirmLabel={`Reset ${name}`}
          tone="danger"
          confirmDisabled={!whyOk}
          onConfirm={() => {
            editor.resetLane(why, () => setWhy(''));
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium">
            Reason for the reset
            <input
              value={why}
              maxLength={500}
              placeholder="Why (at least 3 characters)"
              onChange={(event) => setWhy(event.target.value)}
              className={INPUT_CLASS}
            />
          </label>
        </ConfirmDialog>
      </div>
    </LaneIdProvider>
  );
}
