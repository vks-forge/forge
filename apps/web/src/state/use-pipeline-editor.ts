/**
 * `usePipelineEditor()`: edit one lane's pipeline, check it live, save it as the next version, reset it.
 *
 * Why: a lane save is a numbered, attributed version of its scope's settings, written with
 *   compare-and-swap: the editor must name the version it opened, never whatever is newest when
 *   Save is pressed, or it would silently overwrite a colleague. So this keeps the draft list,
 *   the saved list it started from, the version and a reason (3 to 500 characters, the history
 *   shows it). Whether the draft may be saved is core's `pipelineProblems` run on every change,
 *   plus the server's verdict on the same list a moment after the owner stops editing (the
 *   server knows things the browser may not, such as the project's own agents); Save stays held
 *   while any problem stands. When another save lands first (a 409, or a refetch showing the
 *   lane changed under unsaved edits) saving pauses and the owner chooses: reload and drop the
 *   edits, or keep them on top of the latest. A lane that nobody changed simply follows the
 *   latest, and a save elsewhere that did not touch this lane only moves the version. Unsaved
 *   edits register with the shell's leave guard, which lets the owner look at another lane of
 *   the same screen and asks before they leave it.
 *
 * Exports: usePipelineEditor(), REASON_MIN, REASON_MAX.
 * Depends on: react, react-router, @forge/core, api/use-pipelines, domain/pipeline-copy, domain/pipeline-edit,
 *   schemas/pipelines, state/unsaved-changes, state/use-debounced-value, domain/agent-copy.
 */

import { pipelineProblems } from '@forge/core';
import type { AgentView, Lane, PipelineDefinition, PipelineProblem } from '@forge/core';
import { useState } from 'react';
import { useLocation } from 'react-router';
import {
  useResetPipeline,
  useSavePipeline,
  useValidatePipeline,
} from '#/api/use-pipelines.js';
import { isVersionConflict } from '#/domain/agent-copy.js';
import { pipelineErrorText, problemsOf } from '#/domain/pipeline-copy.js';
import { sameDefinition } from '#/domain/pipeline-inspect.js';
import { PipelineDefinition as DefinitionSchema } from '#/schemas/pipelines.js';
import { useUnsavedChanges } from '#/state/unsaved-changes.js';
import { useDebouncedValue } from '#/state/use-debounced-value.js';
import type { PipelineList, PipelineScope } from '#/types/pipeline-api.types.js';

export const REASON_MIN = 3;
export const REASON_MAX = 500;
const VALIDATE_AFTER_MS = 400;

export function usePipelineEditor(args: {
  scope: PipelineScope;
  lane: Lane;
  list: PipelineList;
  roster: readonly AgentView[];
}) {
  const { scope, lane, list, roster } = args;
  const view = list.lanes[lane];
  const latest: PipelineDefinition = view.definition;
  const [baseline, setBaseline] = useState(latest);
  const [draft, setDraftState] = useState(latest);
  const [opened, setOpened] = useState(list.version);
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const save = useSavePipeline(scope, lane);
  const reset = useResetPipeline(scope, lane);
  const saving = save.isPending;
  const failure = save.error;

  const dirty = !sameDefinition(draft, baseline);
  const moved = !sameDefinition(latest, baseline);

  // Moving between lanes (`?lane=`) stays on this path, so it keeps every lane's draft; leaving asks.
  useUnsavedChanges(dirty, useLocation().pathname);

  function adopt(next: PipelineDefinition, version: number): void {
    setBaseline(next);
    setDraftState(next);
    setOpened(version);
    setReason('');
    save.reset();
  }

  // Nothing changed here: follow the latest instead of showing a conflict about nothing. (Adjusted
  // while rendering, not in an effect: it only re-renders this component, once.)
  if (!dirty && !saving && (moved || list.version !== opened)) {
    setBaseline(latest);
    setDraftState(latest);
    setOpened(list.version);
  }

  // Another lane was saved: this lane is untouched, so the version it will name moves, nothing else.
  if (dirty && !moved && !saving && list.version !== opened) {
    setOpened(list.version);
  }

  const shapeOk = DefinitionSchema.safeParse(draft).success;
  const settled = useDebouncedValue(draft, VALIDATE_AFTER_MS);
  const remote = useValidatePipeline(
    scope,
    lane,
    settled,
    dirty && DefinitionSchema.safeParse(settled).success,
  );

  // The connected model families are the server's to know: this instant check passes none, and
  // the server's own validation (critic_same_family) arrives a moment later.
  const local = pipelineProblems(draft, { roster, lane, families_available: [] });
  const problems: PipelineProblem[] = [
    ...local,
    ...(remote.data?.problems ?? []),
    ...(failure ? problemsOf(failure) : []),
  ];

  const conflict =
    dirty && (moved || isVersionConflict(failure))
      ? { from: opened, to: list.version }
      : null;

  const reasonOk =
    reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX;

  const hold = !dirty
    ? 'Nothing has changed yet.'
    : conflict
      ? 'A newer version exists. Choose how to continue above.'
      : problems.length > 0
        ? 'Fix the problems listed above before saving.'
        : !shapeOk
          ? 'Give every stage a name and fill in every field.'
          : !reasonOk
            ? `Say why you are changing this (${REASON_MIN} to ${REASON_MAX} characters); it goes in the history.`
            : null;

  const company = scope.kind === 'company';
  const canReset = company ? view.tags.includes('edited') : view.changed === true;

  return {
    view,
    draft,
    setDraft: (next: PipelineDefinition) => {
      setSaved(null);
      save.reset();
      setDraftState(next);
    },
    dirty,
    reason,
    setReason,
    hold,
    problems,
    warnings: dirty && remote.data ? [...remote.data.warnings] : view.warnings,
    checking: dirty && (remote.isFetching || settled !== draft),
    version: opened,
    saving,
    saved,
    error: failure && !conflict ? pipelineErrorText(failure) : null,
    conflict,
    save: () => {
      setSaved(null);
      if (hold !== null) {
        return;
      }

      save.mutate(
        { pipeline: draft, expected_version: opened, reason: reason.trim() },
        {
          onSuccess: (result) => {
            adopt(result.lanes[lane].definition, result.version);
            setSaved(`Saved as version ${result.version}.`);
          },
        },
      );
    },
    discard: () => {
      setDraftState(baseline);
      save.reset();
    },
    reload: () => adopt(latest, list.version),
    keepMine: () => {
      setOpened(list.version);
      setBaseline(latest);
      save.reset();
    },
    canReset,
    resetting: reset.isPending,
    resetError: reset.error ? pipelineErrorText(reset.error) : null,
    clearResetError: () => reset.reset(),
    resetLane: (why: string, done: () => void) => {
      setSaved(null);
      reset.mutate(
        { expected_version: list.version, reason: why.trim() },
        {
          onSuccess: (result) => {
            adopt(result.lanes[lane].definition, result.version);
            setSaved(
              company
                ? 'Reset to the built-in pipeline.'
                : 'Reset to the company default.',
            );

            done();
          },
        },
      );
    },
  };
}
