/**
 * AgentList: the roster of one scope, and the confirm dialogs for what a row can do.
 *
 * Why: the roster is the first thing an owner sees, and every state-changing action on it needs
 *   the same care: say what will happen, take a reason (pre-filled, so it is one press), send
 *   the version the list was read at, and show the server's refusal in plain words without
 *   closing, so the owner can fix it and retry. An empty roster is never blank: it offers the
 *   ways to make an agent. After an action the list is already the server's fresh one, so tags
 *   and readiness are never guessed. A copy into the screen's own scope opens straight in the
 *   editor, because the next thing anyone does with a copy is change it.
 *
 * Exports: AgentList.
 * Depends on: react, lucide-react, api/use-agents, components/agents/{agent-row,agent-action-dialog},
 *   components/ui/empty-state, domain/agent-copy, state/notify, types/agent-ui.types.
 */

import { Bot } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAgentAction, useDuplicateAgent } from '#/api/use-agents.js';
import { AgentActionDialog } from '#/components/agents/agent-action-dialog.js';
import { AgentRow } from '#/components/agents/agent-row.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { agentErrorText, defaultReason } from '#/domain/agent-copy.js';
import type { AgentView } from '#/schemas/agents.js';
import { useNotify } from '#/state/notify/notify-context.js';
import type {
  AgentAction,
  AgentList as AgentListData,
  AgentScope,
  RowAction,
} from '#/types/agent-ui.types.js';

/** What the open dialog is asking, in words. */
function wording(
  action: AgentAction | 'duplicate',
  view: AgentView,
  scope: AgentScope,
): { title: string; description: string; confirm: string; danger: boolean } {
  const name = view.definition.name;

  switch (action) {
    case 'archive':
      return {
        title: `Archive ${name}?`,
        description:
          'The Director stops choosing it. Runs and history stay, and you can unarchive it any time.',
        confirm: 'Archive',
        danger: false,
      };
    case 'unarchive':
      return {
        title: `Unarchive ${name}?`,
        description: 'It goes back into the roster for the Director to choose.',
        confirm: 'Unarchive',
        danger: false,
      };
    case 'disable':
      return {
        title: `Switch off ${name} for this project?`,
        description:
          'The Director will not use it here. Other projects are not affected, and you can switch it back on.',
        confirm: 'Switch off',
        danger: false,
      };
    case 'enable':
      return {
        title: `Switch ${name} back on for this project?`,
        description: 'The Director can choose it here again.',
        confirm: 'Switch on',
        danger: false,
      };
    case 'reset':
      return scope.kind === 'company'
        ? {
            title: `Reset ${name} to its built-in text?`,
            description:
              'Your edits to this built-in agent are removed for every project. The history keeps what was there.',
            confirm: 'Reset',
            danger: true,
          }
        : {
            title: `Reset ${name} to the company default?`,
            description:
              'This project’s overrides are removed, so the company agent applies as it is.',
            confirm: 'Reset',
            danger: true,
          };
    case 'duplicate':
      return {
        title: `Duplicate ${name}`,
        description: 'Makes an editable copy with its own name and its own history.',
        confirm: 'Make a copy',
        danger: false,
      };
  }
}

export function AgentList(props: {
  scope: AgentScope;
  list: AgentListData;
  /** What to offer when the roster is empty (the New agent menu). */
  emptyActions: ReactNode;
  onEdit: (id: string) => void;
  /** A copy landed in this screen's own scope. */
  onCopied: (id: string) => void;
}) {
  const { scope, list } = props;
  const [asking, setAsking] = useState<{
    action: AgentAction | 'duplicate';
    view: AgentView;
  } | null>(null);

  const act = useAgentAction(scope);
  const copy = useDuplicateAgent(scope);
  const notify = useNotify();

  function onAction(view: AgentView, action: RowAction): void {
    if (action === 'edit') {
      props.onEdit(view.id);

      return;
    }

    act.reset();
    copy.reset();
    setAsking({ action, view });
  }

  if (list.agents.length === 0) {
    return (
      <EmptyState
        icon={Bot}
        title="No agents yet"
        actions={props.emptyActions}
        variant="compact"
      >
        An agent says who does a piece of work and on what. Make one from scratch, from a
        template, or by describing it to the Director.
      </EmptyState>
    );
  }

  const busy = act.isPending || copy.isPending;
  const failure = act.error ?? copy.error;

  function confirm(value: {
    reason: string;
    name: string;
    target: 'project' | 'company';
  }): void {
    if (!asking) {
      return;
    }

    const { action, view } = asking;
    const label = view.definition.name;

    if (action !== 'duplicate') {
      act.mutate(
        {
          id: view.id,
          action,
          meta: { expected_version: list.version, reason: value.reason },
        },
        {
          onSuccess: () => {
            setAsking(null);
            notify.success(`${label}: done`, { description: value.reason });
          },
        },
      );

      return;
    }

    const target: AgentScope =
      scope.kind === 'project' && value.target === 'project'
        ? scope
        : { kind: 'company' };

    const toCompany = target.kind === 'company';

    copy.mutate(
      {
        id: view.id,
        body: {
          name: value.name,
          target,
          expected_version: toCompany ? list.companyVersion : list.version,
          reason: value.reason,
        },
      },
      {
        onSuccess: (result) => {
          setAsking(null);
          if (target.kind === scope.kind && result.id) {
            props.onCopied(result.id);
          } else {
            notify.success(`Copied ${label} to the company`, { description: value.name });
          }
        },
      },
    );
  }

  const words = asking ? wording(asking.action, asking.view, scope) : null;

  return (
    <>
      <ul aria-label="Agent roster" className="grid gap-3">
        {list.agents.map((view) => (
          <AgentRow
            key={`${view.scope}-${view.id}`}
            view={view}
            scope={scope}
            onAction={(action) => onAction(view, action)}
          />
        ))}
      </ul>
      {asking && words ? (
        <AgentActionDialog
          key={`${asking.action}-${asking.view.id}`}
          title={words.title}
          description={words.description}
          confirmLabel={words.confirm}
          tone={words.danger ? 'danger' : 'primary'}
          initialReason={defaultReason(asking.action)}
          {...(asking.action === 'duplicate'
            ? { initialName: `${asking.view.definition.name} copy` }
            : {})}
          chooseTarget={asking.action === 'duplicate' && scope.kind === 'project'}
          busy={busy}
          error={failure ? agentErrorText(failure) : null}
          onClose={() => setAsking(null)}
          onConfirm={confirm}
        />
      ) : null}
    </>
  );
}
