/**
 * AgentEditor: the one form for every agent, whatever its source.
 *
 * Why: an agent can be a built-in the owner edits, a company agent, a project's own agent, a
 *   template copy or the Director's draft, and a project can override a company agent's
 *   instructions and harness. One form for all of them means one set of rules and one place to
 *   learn: identity, instructions, where it runs, tools, write scope, hand-offs, memory, budget,
 *   a test button and the history. Saving is a numbered version with a reason; a newer version
 *   saved elsewhere pauses the save behind a conflict choice; unsaved edits are guarded. On a
 *   project screen over a company agent only instructions and "Runs on" are editable, because
 *   that is all a project may change (d-0149), and the rest is shown as following the company.
 *
 * Exports: AgentEditor.
 * Depends on: components/agents/*, components/settings/{section-nav,form-field},
 *   components/ui/button, domain/agent-copy, domain/agent-form, state/use-agent-editor,
 *   types/agent-ui.types.
 */

import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { AgentConflictBanner } from '#/components/agents/agent-conflict-banner.js';
import { AgentHistoryPanel } from '#/components/agents/agent-history-panel.js';
import { AgentSaveBar } from '#/components/agents/agent-save-bar.js';
import { AgentTags } from '#/components/agents/agent-tags.js';
import {
  BudgetSection,
  HandoffSection,
  SkillsMemorySection,
  WriteScopeSection,
} from '#/components/agents/extra-sections.js';
import { IdentitySection } from '#/components/agents/identity-section.js';
import { InstructionsSection } from '#/components/agents/instructions-section.js';
import { RunsOnSection } from '#/components/agents/runs-on-section.js';
import { TestAgentPanel } from '#/components/agents/test-agent-panel.js';
import { ToolsSection } from '#/components/agents/tools-section.js';
import { Notice } from '#/components/settings/form-field.js';
import { SectionNav } from '#/components/settings/section-nav.js';
import { SettingsCard } from '#/components/settings/settings-card.js';
import { Button } from '#/components/ui/button.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { issueAt } from '#/domain/agent-form.js';
import { useAgentEditor } from '#/state/use-agent-editor.js';
import type {
  AgentList,
  AgentScope,
  DraftNote,
  AgentSeed,
} from '#/types/agent-ui.types.js';

const TABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'runs-on', label: 'Runs on' },
  { id: 'tools', label: 'Tools' },
  { id: 'write-scope', label: 'Write scope' },
  { id: 'handoff', label: 'Inputs and output' },
  { id: 'skills-memory', label: 'Skills and memory' },
  { id: 'budget', label: 'Budget' },
  { id: 'test', label: 'Test' },
];

const OVERRIDE_TABS = TABS.filter((t) =>
  ['instructions', 'runs-on', 'test'].includes(t.id),
);

/** Where a new agent came from, in words. */
function originWords(origin: string): string {
  if (origin === 'director_draft') {
    return 'Drafted by the Director from your description.';
  }

  if (origin.startsWith('template:')) {
    return 'Started from a template.';
  }

  if (origin.startsWith('duplicate:')) {
    return 'A copy of another agent.';
  }

  return 'Started from scratch.';
}

export function AgentEditor(props: {
  scope: AgentScope;
  list: AgentList;
  /** The agent to edit; absent while creating from `seed`. */
  id: string | undefined;
  seed: AgentSeed | undefined;
  note: DraftNote | undefined;
  saved: string | undefined;
  onBack: () => void;
  onCreated: (id: string, message: string) => void;
}) {
  const editor = useAgentEditor({
    scope: props.scope,
    list: props.list,
    id: props.id,
    seed: props.seed,
    saved: props.saved,
    onCreated: props.onCreated,
  });

  const { form, view, issues, override } = editor;
  const creating = props.id === undefined;
  const lock = editor.saving;
  const company = view?.base ?? (override ? view?.definition : undefined);
  const heading = form.name.trim() === '' ? 'New agent' : form.name;
  const set = editor.setForm;
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="quiet"
          onClick={() => (editor.dirty ? setLeaving(true) : props.onBack())}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          All agents
        </Button>
      </div>
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 break-words text-xl font-semibold tracking-tight">
            {heading}
          </h2>
          {view ? <AgentTags tags={view.tags} scope={props.scope.kind} /> : null}
        </div>
        <p className="text-sm text-muted">
          {creating && props.seed
            ? originWords(props.seed.origin)
            : override
              ? 'You are overriding this company agent for this project. Only instructions and where it runs can differ.'
              : view?.id
                ? `Agent id: ${view.id}`
                : ''}
        </p>
      </header>

      {props.note ? (
        <Notice
          tone="info"
          title="Drafted by the Director. Nothing is saved until you press Create agent."
        >
          <p>{props.note.rationale}</p>
          {props.note.questions.length > 0 ? (
            <>
              <p className="mt-2 font-medium text-fg">The Director asks you to check:</p>
              <ul className="list-disc pl-5">
                {props.note.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Notice>
      ) : null}

      {editor.conflict ? (
        <AgentConflictBanner
          from={editor.conflict.from}
          to={editor.conflict.to}
          changed={editor.conflict.changed}
          canKeep={editor.dirty}
          onReload={editor.reload}
          onKeep={editor.keepMine}
        />
      ) : null}

      <SectionNav tabs={override ? OVERRIDE_TABS : TABS} />

      {override ? null : (
        <IdentitySection
          form={form}
          issues={issues}
          disabled={lock}
          existing={!creating}
          onChange={set}
        />
      )}
      <InstructionsSection
        value={form.instructions}
        error={issueAt(issues, 'instructions')}
        disabled={lock}
        {...(company
          ? {
              note: 'Starts as the company agent’s text. Saving stores only your change.',
            }
          : {})}
        onChange={(instructions) => set({ ...form, instructions })}
      />
      <RunsOnSection
        runsOn={form.runs_on}
        role={form.role}
        issues={issues}
        disabled={lock}
        isImplementer={props.id === 'implementer'}
        {...(company ? { note: 'Starts as the company agent’s choice.' } : {})}
        onChange={(runs_on) => set({ ...form, runs_on })}
      />
      {override ? (
        <SettingsCard
          id="rest"
          title="Everything else"
          description="Name, role, tools, write scope, hand-offs, memory and budget follow the company agent."
        >
          <p className="text-sm text-muted">
            To change those, edit the agent in Forge settings, under Agents.
          </p>
        </SettingsCard>
      ) : (
        <>
          <ToolsSection
            form={form}
            error={issueAt(issues, 'tools')}
            disabled={lock}
            onChange={set}
          />
          <WriteScopeSection form={form} issues={issues} disabled={lock} onChange={set} />
          <HandoffSection form={form} issues={issues} disabled={lock} onChange={set} />
          <SkillsMemorySection
            form={form}
            issues={issues}
            disabled={lock}
            onChange={set}
          />
          <BudgetSection form={form} issues={issues} disabled={lock} onChange={set} />
        </>
      )}
      <TestAgentPanel form={form} scope={props.scope} />
      {props.id ? <AgentHistoryPanel scope={props.scope} id={props.id} /> : null}

      <AgentSaveBar
        creating={creating}
        override={override}
        version={editor.version}
        dirty={editor.dirty}
        reason={editor.reason}
        onReason={editor.setReason}
        hold={editor.hold}
        saving={editor.saving}
        issueCount={issues.length}
        error={editor.error}
        saved={editor.saved}
        onSave={editor.save}
        onDiscard={editor.discard}
      />
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Discard your changes?"
        description="What you changed in this agent has not been saved and will be lost."
        confirmLabel="Discard"
        tone="danger"
        onConfirm={props.onBack}
      />
    </div>
  );
}
