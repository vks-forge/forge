/**
 * `useRoutingEditor()`: edit a project's routing rules and save them as the next project version.
 *
 * Why: routing rules ("when a change touches `**\/*.tf`, add the network reviewer") are a
 *   project's own list, saved on their own like a lane but in the same versioned project
 *   settings, so they follow the same discipline as `usePipelineEditor`: name the version you
 *   opened, say why, pause on a conflict instead of overwriting, and register unsaved edits with
 *   the leave guard. Core's `routingProblems` runs on every change (a rule that names a writer,
 *   an unknown or switched-off agent, or a repeated id is shown beside its row and holds Save),
 *   and a rule with no path is held too, since a rule that matches nothing is a mistake.
 *
 * Exports: useRoutingEditor().
 * Depends on: react, react-router, @forge/core, api/use-pipelines, domain/agent-copy, domain/pipeline-copy,
 *   state/unsaved-changes, state/use-pipeline-editor (limits).
 */

import { routingProblems } from '@forge/core';
import type { AgentView, RoutingRule } from '@forge/core';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { useSaveRouting } from '#/api/use-pipelines.js';
import { isVersionConflict } from '#/domain/agent-copy.js';
import { pipelineErrorText, problemsOf } from '#/domain/pipeline-copy.js';
import { useUnsavedChanges } from '#/state/unsaved-changes.js';
import { REASON_MAX, REASON_MIN } from '#/state/use-pipeline-editor.js';
import type { PipelineList } from '#/types/pipeline-api.types.js';

const same = (a: readonly RoutingRule[], b: readonly RoutingRule[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export function useRoutingEditor(args: {
  slug: string;
  list: PipelineList;
  roster: readonly AgentView[];
}) {
  const { slug, list, roster } = args;
  const latest = list.routing;
  const [baseline, setBaseline] = useState<readonly RoutingRule[]>(latest);
  const [draft, setDraftState] = useState<readonly RoutingRule[]>(latest);
  const [opened, setOpened] = useState(list.version);
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const save = useSaveRouting(slug);
  const saving = save.isPending;
  const failure = save.error;

  const dirty = !same(draft, baseline);
  const moved = !same(latest, baseline);

  useUnsavedChanges(dirty, useLocation().pathname);

  function adopt(next: readonly RoutingRule[], version: number): void {
    setBaseline(next);
    setDraftState(next);
    setOpened(version);
    setReason('');
    save.reset();
  }

  if (!dirty && !saving && (moved || list.version !== opened)) {
    setBaseline(latest);
    setDraftState(latest);
    setOpened(list.version);
  }

  if (dirty && !moved && !saving && list.version !== opened) {
    setOpened(list.version);
  }

  const problems = [
    ...routingProblems(draft, roster),
    ...(failure ? problemsOf(failure) : []),
  ];

  const conflict =
    dirty && (moved || isVersionConflict(failure))
      ? { from: opened, to: list.version }
      : null;

  const reasonOk =
    reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX;

  const emptyRule = draft.some((r) => r.paths.length === 0 || r.add === '');

  const hold = !dirty
    ? 'Nothing has changed yet.'
    : conflict
      ? 'A newer version exists. Choose how to continue above.'
      : problems.length > 0
        ? 'Fix the problems listed beside the rules before saving.'
        : emptyRule
          ? 'Give every rule at least one path and an agent.'
          : !reasonOk
            ? `Say why you are changing this (${REASON_MIN} to ${REASON_MAX} characters); it goes in the history.`
            : null;

  return {
    draft,
    setDraft: (next: readonly RoutingRule[]) => {
      setSaved(null);
      save.reset();
      setDraftState(next);
    },
    dirty,
    reason,
    setReason,
    hold,
    problems,
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
        { rules: draft, expected_version: opened, reason: reason.trim() },
        {
          onSuccess: (result) => {
            adopt(result.routing, result.version);
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
  };
}
