/**
 * `useAgentEditor()`: edit one agent, save it as the next version, survive a conflict.
 *
 * Why: an agent save is a numbered version of its scope's settings, written with
 *   compare-and-swap: the editor must name the version it opened, never whatever is newest when
 *   Save is pressed, or it would silently overwrite a colleague. So this keeps the form, the
 *   version it started from and a reason (3 to 500 characters, it goes in the history), and
 *   decides what Save sends: a new agent, an edited one, or, on a project screen over a company
 *   agent, only the two things a project may override. When another save lands first (the
 *   server's 409 `version_conflict`, or a refetch that shows a newer version), saving pauses and
 *   the owner chooses: reload the latest and drop their edits, or keep them on top of the latest.
 *   An editor with nothing changed simply follows the latest. Field problems show only after the
 *   owner tries to save, so an empty new form is not a wall of red. Unsaved edits register with
 *   the shell's leave guard.
 *
 * Exports: useAgentEditor(), REASON_MIN, REASON_MAX.
 * Depends on: react, api/use-agents, domain/agent-copy, domain/agent-form, state/unsaved-changes,
 *   schemas/agents, types/agent-ui.types.
 */

import { useState } from 'react';
import { useCreateAgent, useUpdateAgent } from '#/api/use-agents.js';
import { agentErrorText, isVersionConflict } from '#/domain/agent-copy.js';
import {
  changedFields,
  checkForm,
  emptyForm,
  formFromFields,
  overrideFrom,
  sameForm,
} from '#/domain/agent-form.js';
import type { AgentView } from '#/schemas/agents.js';
import { useUnsavedChanges } from '#/state/unsaved-changes.js';
import type {
  AgentForm,
  AgentList,
  AgentScope,
  AgentSeed,
} from '#/types/agent-ui.types.js';

export const REASON_MIN = 3;
export const REASON_MAX = 500;

export function useAgentEditor(args: {
  scope: AgentScope;
  list: AgentList;
  /** An existing agent, or `undefined` while creating from `seed`. */
  id: string | undefined;
  seed: AgentSeed | undefined;
  saved: string | undefined;
  onCreated: (id: string, message: string) => void;
}) {
  const { scope, list, id, seed } = args;
  const view: AgentView | undefined = list.agents.find((a) => a.id === id);
  const latestForm = view ? formFromFields(view.definition) : undefined;
  // A project screen over a company agent may change only instructions and where it runs.
  const override = scope.kind === 'project' && view?.scope === 'company';
  const [baseline, setBaseline] = useState<AgentForm>(latestForm ?? emptyForm());
  const [form, setForm] = useState<AgentForm>(latestForm ?? seed?.form ?? emptyForm());
  const [opened, setOpened] = useState(list.version);
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState<string | null>(args.saved ?? null);
  const [attempted, setAttempted] = useState(false);
  const create = useCreateAgent(scope);
  const update = useUpdateAgent(scope);
  const saving = create.isPending || update.isPending;
  const failure = create.error ?? update.error;

  const dirty = !sameForm(form, baseline);
  const stale = list.version !== opened;
  const checked = checkForm(form);
  const reasonOk =
    reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX;

  useUnsavedChanges(dirty);

  function adopt(next: AgentForm | undefined, version: number): void {
    setBaseline(next ?? emptyForm());
    setOpened(version);
    setReason('');
    setAttempted(false);
    create.reset();
    update.reset();
  }

  // Nothing changed here: follow the latest instead of showing a conflict about nothing. (Adjusted
  // while rendering, not in an effect: it only re-renders this component, once.)
  if (stale && !dirty && !saving && latestForm) {
    setForm(latestForm);
    setBaseline(latestForm);
    setOpened(list.version);
  }

  const conflict =
    dirty && (stale || isVersionConflict(failure))
      ? {
          from: opened,
          to: list.version,
          changed: latestForm === undefined ? [] : changedFields(baseline, latestForm),
        }
      : null;

  const hold = !dirty
    ? 'Nothing has changed yet.'
    : conflict
      ? 'A newer version exists. Choose how to continue above.'
      : !reasonOk
        ? `Say why you are changing this (${REASON_MIN} to ${REASON_MAX} characters); it goes in the history.`
        : null;

  function onSuccess(result: AgentList & { id?: string }): void {
    const target = result.agents.find((a) => a.id === (result.id ?? id));
    const next = target ? formFromFields(target.definition) : form;
    const message = `Saved as version ${result.version}.`;

    if (id === undefined && result.id !== undefined) {
      args.onCreated(result.id, `Created as version ${result.version}.`);

      return;
    }

    setForm(next);
    adopt(next, result.version);
    setSaved(message);
  }

  function save(): void {
    setAttempted(true);
    setSaved(null);
    if (!checked.value || hold !== null) {
      return;
    }

    const meta = { expected_version: opened, reason: reason.trim() };
    const options = { onSuccess };

    if (id === undefined) {
      create.mutate(
        { agent: checked.value, origin: seed?.origin ?? 'custom', ...meta },
        options,
      );
    } else if (override) {
      update.mutate(
        { id, body: { kind: 'override', override: overrideFrom(form), ...meta } },
        options,
      );
    } else {
      update.mutate(
        { id, body: { kind: 'agent', agent: checked.value, ...meta } },
        options,
      );
    }
  }

  return {
    view,
    override,
    form,
    setForm: (next: AgentForm) => {
      setSaved(null);
      setForm(next);
    },
    issues: attempted ? checked.issues : [],
    dirty,
    reason,
    setReason,
    hold,
    save,
    saving,
    saved,
    version: opened,
    error: failure && !isVersionConflict(failure) ? agentErrorText(failure) : null,
    conflict,
    discard: () => {
      setForm(baseline);
      setAttempted(false);
      create.reset();
      update.reset();
    },
    reload: () => {
      const next = latestForm ?? baseline;

      setForm(next);
      adopt(next, list.version);
    },
    keepMine: () => {
      adopt(latestForm ?? baseline, list.version);
    },
  };
}
