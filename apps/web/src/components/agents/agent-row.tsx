/**
 * AgentRow: one agent in the roster, with the facts to choose by and the actions that apply to it.
 *
 * Why: the roster is where an owner decides which agent to open, copy, set aside or reset, so
 *   each row shows what the Director reads (name, description), what the agent is (role, tags)
 *   and where it runs with a readiness dot that says in words whether that harness can run work
 *   now. Only the actions that make sense for this agent appear: a built-in is edited or reset,
 *   never archived; a company agent seen from a project is overridden or switched off there, not
 *   edited; the implementer cannot be switched off, and the row says why instead of hiding the
 *   action. Every action is a real button or menu item, reachable with the keyboard. In a project the row
 *   also carries the agent's record over 90 days in one line (or "Too few tickets to judge").
 *
 * Exports: AgentRow.
 * Depends on: @radix-ui/react-dropdown-menu, lucide-react, components/agents/agent-tags,
 *   components/ui/button, domain/agent-copy, domain/agent-models, domain/scorecard-copy, schemas/agents.
 */

import * as Menu from '@radix-ui/react-dropdown-menu';
import { Copy, Ellipsis } from 'lucide-react';
import { AgentTags } from '#/components/agents/agent-tags.js';
import { Button } from '#/components/ui/button.js';
import { ROLE_INFO } from '#/domain/agent-copy.js';
import { runsOnLabel } from '#/domain/agent-models.js';
import { summaryLine } from '#/domain/scorecard-copy.js';
import type { AgentView } from '#/schemas/agents.js';
import type { ScorecardRow } from '#/schemas/pipeline-proposals.js';
import type { AgentScope, RowAction } from '#/types/agent-ui.types.js';

const ITEM =
  'flex min-h-9 cursor-default select-none items-center gap-2 rounded-md px-2 text-sm outline-none data-[disabled]:text-faint data-[highlighted]:bg-hover';

/** The menu entries that apply to this row, as `[action, label, reason it is unavailable]`. */
function menuEntries(
  view: AgentView,
  scope: AgentScope,
): readonly (readonly [RowAction, string, string?])[] {
  const has = (tag: AgentView['tags'][number]): boolean => view.tags.includes(tag);
  const entries: (readonly [RowAction, string, string?])[] = [
    ['duplicate', 'Duplicate…'],
  ];

  if (scope.kind === 'company') {
    if (has('archived')) {
      entries.push(['unarchive', 'Unarchive']);
    } else if (!has('builtin')) {
      entries.push(['archive', 'Archive']);
    }

    if (has('builtin') && has('overridden')) {
      entries.push(['reset', 'Reset to built-in…']);
    }

    return entries;
  }

  if (view.scope === 'project') {
    entries.push(has('archived') ? ['unarchive', 'Unarchive'] : ['archive', 'Archive']);

    return entries;
  }

  if (has('overridden')) {
    entries.push(['reset', 'Reset to company default…']);
  }

  entries.push(
    has('disabled')
      ? ['enable', 'Enable here']
      : view.id === 'implementer'
        ? [
            'disable',
            'Disable here',
            'The implementer is needed until pipelines can name another writer.',
          ]
        : ['disable', 'Disable here'],
  );

  return entries;
}

export function AgentRow(props: {
  view: AgentView;
  scope: AgentScope;
  /** This agent's all-tickets row over 90 days; absent outside a project or while it loads. */
  record?: ScorecardRow | undefined;
  /** Whether the record is still loading or failed to load, so the row says so instead of staying silent. */
  recordState?: 'loading' | 'error' | 'ready';
  onAction: (action: RowAction) => void;
}) {
  const { view, scope } = props;
  const def = view.definition;
  const override = scope.kind === 'project' && view.scope === 'company';
  const muted = view.tags.includes('archived') || view.tags.includes('disabled');
  const ready = view.readiness.ready;

  return (
    <li
      className={`grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start ${
        muted ? 'opacity-75' : ''
      }`}
    >
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="min-w-0 break-words text-sm font-semibold">{def.name}</h3>
          <AgentTags tags={view.tags} scope={scope.kind} />
          <span className="text-xs text-muted">{ROLE_INFO[def.role].label}</span>
        </div>
        <p className="line-clamp-2 max-w-prose text-sm text-muted">{def.description}</p>
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${ready ? 'bg-good' : 'bg-attn'}`}
          />
          <span className="font-data text-muted">{runsOnLabel(def.runs_on)}</span>
          <span className={ready ? 'text-muted' : 'text-fg'}>
            {ready ? 'Ready' : `Cannot run now. ${view.readiness.reasons.join(' ')}`}
          </span>
        </p>
        {props.recordState === undefined ? null : (
          <p className="text-xs text-muted">
            {props.recordState === 'loading'
              ? 'Loading its record…'
              : props.recordState === 'error'
                ? 'Its record could not be loaded.'
                : `Last 90 days: ${summaryLine(props.record)}`}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          aria-label={`${override ? 'Override' : 'Edit'} ${def.name}`}
          onClick={() => props.onAction('edit')}
        >
          {override ? 'Override' : 'Edit'}
        </Button>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button className="min-w-9 px-0" aria-label={`More actions for ${def.name}`}>
              <Ellipsis aria-hidden="true" className="size-4" />
            </Button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              align="end"
              sideOffset={6}
              className="z-[70] min-w-52 rounded-xl border border-line bg-surface p-1 shadow-float"
            >
              {menuEntries(view, scope).map(([action, label, why]) => (
                <Menu.Item
                  key={action}
                  className={ITEM}
                  disabled={why !== undefined}
                  onSelect={() => props.onAction(action)}
                >
                  {action === 'duplicate' ? (
                    <Copy aria-hidden="true" className="size-4 text-muted" />
                  ) : null}
                  <span className="grid">
                    {label}
                    {why ? <span className="text-xs text-muted">{why}</span> : null}
                  </span>
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </li>
  );
}
