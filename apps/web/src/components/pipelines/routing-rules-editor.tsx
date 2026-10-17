/**
 * RoutingRulesEditor: a project's routing rules, the way a change can pull in an extra check.
 *
 * Why: a lane's pipeline is the same for every change, but some changes deserve a closer look:
 *   a Terraform file wants the network reviewer, a migration wants the migration reviewer. A
 *   routing rule says "when the plan or the real change touches these paths, add this check",
 *   and it only ever adds (d-0069): nothing a lane requires can be switched off by a rule. This
 *   section edits the project's list, with its own save bar and reason, loading and empty states
 *   (no rules is a normal answer, with the first rule one click away), and the same conflict
 *   banner as a lane.
 *
 * Exports: RoutingRulesEditor.
 * Depends on: react, lucide-react, components/pipelines/*, components/ui/button,
 *   domain/pipeline-edit, state/use-routing-editor, @forge/core (types).
 */

import { Plus, Route } from 'lucide-react';
import type { AgentView } from '@forge/core';
import { PipelineConflictBanner } from '#/components/pipelines/pipeline-conflict-banner.js';
import { PipelineSaveBar } from '#/components/pipelines/pipeline-save-bar.js';
import { RoutingRuleRow } from '#/components/pipelines/routing-rule-row.js';
import { Button } from '#/components/ui/button.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { uniqueId, usableAgents } from '#/domain/pipeline-edit.js';
import { useRoutingEditor } from '#/state/use-routing-editor.js';
import type { PipelineList } from '#/types/pipeline-api.types.js';

const MAX_RULES = 20;

export function RoutingRulesEditor(props: {
  slug: string;
  list: PipelineList;
  roster: readonly AgentView[];
}) {
  const editor = useRoutingEditor(props);
  const { draft } = editor;
  const byRule = new Map<string, typeof editor.problems>();

  for (const problem of editor.problems) {
    const key = problem.stage_id ?? '';

    byRule.set(key, [...(byRule.get(key) ?? []), problem]);
  }

  const add = (): void => {
    const check = usableAgents(props.roster).find((a) =>
      ['reviewer', 'researcher'].includes(a.definition.role),
    );

    editor.setDraft([
      ...draft,
      {
        id: uniqueId('rule', new Set(draft.map((r) => r.id))),
        paths: [],
        add: check?.id ?? '',
      },
    ]);
  };

  const move = (at: number, direction: -1 | 1): void => {
    const next = [...draft];
    const other = next[at + direction];
    const here = next[at];

    if (other === undefined || here === undefined) {
      return;
    }

    next[at + direction] = here;
    next[at] = other;
    editor.setDraft(next);
  };

  return (
    <section aria-labelledby="routing-heading" className="grid gap-4">
      <header className="grid gap-1">
        <h3 id="routing-heading" className="text-base font-semibold">
          Routing rules
        </h3>
        <p className="max-w-prose text-sm text-muted">
          When a change touches certain paths, add an extra check before the merge. Rules
          only add checks; they never remove one a lane requires.
        </p>
      </header>

      {editor.conflict ? (
        <PipelineConflictBanner
          subject="The routing rules"
          from={editor.conflict.from}
          to={editor.conflict.to}
          onKeep={editor.keepMine}
          onReload={editor.reload}
        />
      ) : null}

      {draft.length === 0 ? (
        <EmptyState title="No routing rules yet" icon={Route} variant="compact">
          Every change in this project follows its lane exactly. Add a rule to pull in a
          specialist check for some paths.
        </EmptyState>
      ) : (
        <ol aria-label="Routing rules" className="grid gap-3">
          {draft.map((rule, at) => (
            <RoutingRuleRow
              key={rule.id}
              rule={rule}
              position={at + 1}
              count={draft.length}
              roster={props.roster}
              problems={byRule.get(rule.id) ?? []}
              onChange={(next) =>
                editor.setDraft(draft.map((r) => (r.id === rule.id ? next : r)))
              }
              onMove={(direction) => move(at, direction)}
              onRemove={() => editor.setDraft(draft.filter((r) => r.id !== rule.id))}
            />
          ))}
        </ol>
      )}

      <div>
        <Button onClick={add} disabled={editor.saving || draft.length >= MAX_RULES}>
          <Plus aria-hidden="true" className="size-4" />
          Add rule
        </Button>
      </div>

      <PipelineSaveBar
        idPrefix="routing"
        subject="the routing rules"
        saveLabel="Save routing rules"
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
    </section>
  );
}
