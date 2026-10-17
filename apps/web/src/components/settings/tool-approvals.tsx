/**
 * ToolApprovals: the harness's built-in tools, and the ones that need the owner's decision.
 *
 * Why: a harness update can change what a built-in tool accepts (a new shell flag, a wider
 *   file argument), and Forge's policy was written against the old shape. Forge records a
 *   fingerprint of each tool's schema and holds a changed or new one as "needs approval" until
 *   the owner approves or denies it; Workers cannot use it meanwhile. Pending tools come
 *   first, each decision asks for confirmation with a reason (kept in the record), and an
 *   earlier decision can be reversed from its row. Nothing is applied before the server
 *   accepts it, because an approval is an audited, security-relevant act.
 *
 * Exports: ToolApprovals (with ToolApproveAll for deciding every pending tool at once).
 * Depends on: react, @tanstack/react-query, @forge/core (type), api/api-provider,
 *   api/describe-error, api/use-settings-data, components/settings/*, tool-approve-all, components/ui/button,
 *   domain/format-time, schemas/settings, state/use-submit.
 */

import type { HarnessToolSchema } from '@forge/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForgeApi } from '#/api/api-provider.js';
import { describeError } from '#/api/describe-error.js';
import { toolsKey, useTools } from '#/api/use-settings-data.js';
import { DecisionDialog } from '#/components/settings/decision-dialog.js';
import { Notice } from '#/components/settings/form-field.js';
import { ToolApproveAll } from '#/components/settings/tool-approve-all.js';
import { StatusPill } from '#/components/settings/status-pill.js';
import { Button } from '#/components/ui/button.js';
import { formatWhen } from '#/domain/format-time.js';
import type { DecisionForm } from '#/schemas/settings.js';
import { useSubmit } from '#/state/use-submit.js';
import type { ToolDecision } from '#/types/settings-api.types.js';
import type { AskedDecision as Asked } from '#/types/settings-ui.types.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { Wrench } from 'lucide-react';

const ORDER = { pending: 0, denied: 1, approved: 2 } as const;

function Row(props: { row: HarnessToolSchema; onAsk: (decision: ToolDecision) => void }) {
  const { row } = props;
  const pending = row.status === 'pending';

  return (
    <li className="grid gap-2 border-b border-line py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-data text-sm font-medium">{row.tool}</span>
          {pending ? (
            <StatusPill tone="attn">Needs approval</StatusPill>
          ) : row.status === 'approved' ? (
            <StatusPill tone="good">Approved</StatusPill>
          ) : (
            <StatusPill tone="bad">Denied</StatusPill>
          )}
        </div>
        <p className="font-data text-xs break-all text-faint" title={row.schema_hash}>
          {row.schema_hash.slice(0, 19)}…
        </p>
        {row.decided_by ? (
          <p className="text-xs text-muted">
            {row.status === 'approved' ? 'Approved' : 'Denied'} by {row.decided_by}
            {row.decided_at ? `, ${formatWhen(row.decided_at)}` : ''}
            {row.decision_reason ? `: ${row.decision_reason}` : ''}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {row.status !== 'approved' ? (
          <Button
            variant={pending ? 'primary' : 'quiet'}
            aria-label={`Approve ${row.tool}`}
            onClick={() => props.onAsk('approve')}
          >
            Approve
          </Button>
        ) : null}
        {row.status !== 'denied' ? (
          <Button
            variant={pending ? 'quiet' : 'danger'}
            aria-label={`Deny ${row.tool}`}
            onClick={() => props.onAsk('deny')}
          >
            Deny
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function ToolApprovals(props: { id: string }) {
  const { id } = props;
  const api = useForgeApi();
  const queryClient = useQueryClient();
  const tools = useTools(id, true);
  const [asked, setAsked] = useState<Asked | null>(null);

  const decide = useSubmit(async (target: Asked, form: DecisionForm) => {
    await api.harnesses.decideTool(id, target.tool, target.decision, form);
    await queryClient.invalidateQueries({ queryKey: toolsKey(id) });

    return true;
  });

  if (tools.isPending) {
    return (
      <div
        role="status"
        aria-label="Loading tools"
        className="h-24 animate-pulse rounded-lg bg-hover"
      />
    );
  }

  if (tools.isError) {
    return (
      <Notice tone="error" title={describeError(tools.error).title}>
        {describeError(tools.error).detail}
      </Notice>
    );
  }

  const rows = [...tools.data.tools].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || a.tool.localeCompare(b.tool),
  );

  const waiting = rows.filter((r) => r.status === 'pending').length;
  const approving = asked?.decision === 'approve';

  if (rows.length === 0) {
    return (
      <EmptyState variant="compact" icon={Wrench} title="No tool schemas recorded yet">
        Run the compatibility check and they will appear here.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-3">
      {waiting > 0 ? (
        <Notice
          tone="warn"
          title={`${waiting} tool${waiting === 1 ? '' : 's'} need${waiting === 1 ? 's' : ''} your decision`}
        >
          Workers cannot use these until you approve them. Changed tools have a new schema
          since the last approval.
          <ToolApproveAll
            id={id}
            pending={rows.filter((r) => r.status === 'pending').map((r) => r.tool)}
          />
        </Notice>
      ) : null}
      <ul aria-label="Built-in tools">
        {rows.map((row) => (
          <Row
            key={row.tool}
            row={row}
            onAsk={(decision) => {
              decide.reset();
              setAsked({ tool: row.tool, decision });
            }}
          />
        ))}
      </ul>
      <DecisionDialog
        open={asked !== null}
        title={`${approving ? 'Approve' : 'Deny'} ${asked?.tool ?? ''}?`}
        description={
          approving
            ? 'Workers will be allowed to use this tool with its current schema.'
            : 'Workers will be blocked from using this tool until it is approved again.'
        }
        confirmLabel={approving ? 'Approve tool' : 'Deny tool'}
        tone={approving ? 'primary' : 'danger'}
        pending={decide.pending}
        error={decide.status === 'error' ? describeError(decide.error).detail : undefined}
        onCancel={() => setAsked(null)}
        onConfirm={(form) => {
          if (asked) {
            void decide.run(asked, form).then((done) => {
              if (done) {
                setAsked(null);
              }
            });
          }
        }}
      />
    </div>
  );
}
