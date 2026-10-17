/**
 * AgentHistoryPanel: who changed this agent, when, and why.
 *
 * Why: an agent is edited over time by the owner, by a template and by the Director's draft,
 *   and a run names the exact definition it used. The history, read from the scope's saved
 *   versions, answers "what changed since the run that went wrong?" without leaving the agent.
 *   It loads only when opened (most visits never need it) and covers its own loading, empty
 *   and error states.
 *
 * Exports: AgentHistoryPanel.
 * Depends on: react, api/use-agents, components/settings/settings-card, components/ui/button,
 *   domain/format-time, api/describe-error, types/agent-ui.types.
 */

import { useState } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useAgentHistory } from '#/api/use-agents.js';
import { SettingsCard } from '#/components/settings/settings-card.js';
import { Button } from '#/components/ui/button.js';
import { formatWhen } from '#/domain/format-time.js';
import type { AgentScope } from '#/types/agent-ui.types.js';

export function AgentHistoryPanel(props: { scope: AgentScope; id: string }) {
  const [open, setOpen] = useState(false);
  const history = useAgentHistory(props.scope, props.id, open);
  const rows = [...(history.data ?? [])].reverse();

  return (
    <SettingsCard
      id="history"
      title="History"
      description="Every saved change to this agent, newest first."
    >
      <div className="grid gap-3">
        <div>
          <Button aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Hide history' : 'Show history'}
          </Button>
        </div>
        {open && history.isPending ? (
          <p role="status" className="text-sm text-muted">
            Loading history…
          </p>
        ) : null}
        {open && history.isError ? (
          <div role="alert" className="grid justify-items-start gap-2 text-sm">
            <p className="text-danger">
              Could not load the history. {describeError(history.error).detail}
            </p>
            <Button onClick={() => void history.refetch()}>Try again</Button>
          </div>
        ) : null}
        {open && history.isSuccess && rows.length === 0 ? (
          <p className="text-sm text-muted">No saved changes to this agent yet.</p>
        ) : null}
        {rows.length > 0 ? (
          <ol aria-label="Agent history" className="grid gap-2">
            {rows.map((row) => (
              <li
                key={`${row.version}-${row.change}`}
                className="grid gap-0.5 rounded-lg border border-line px-3 py-2 text-sm"
              >
                <p>
                  <span className="font-medium">Version {row.version}</span> ·{' '}
                  {row.change} by {row.author} · <time>{formatWhen(row.created_at)}</time>
                </p>
                <p className="text-muted">{row.reason}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </SettingsCard>
  );
}
