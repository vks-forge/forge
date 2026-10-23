/**
 * Project settings, Tool approvals: the "always" rules the owner has granted this project, each
 * one revocable.
 *
 * Why: choosing "Always for this project" on a waiting tool call stores a standing permission,
 *   and a permission the owner cannot see or take back would be a trap. This tab lists every one
 *   in plain words (what it lets through, the ticket it came from, and when), with Revoke on
 *   each. Revoking is not instant: it marks the rule, and the shared save bar below saves a new
 *   settings version with the owner's reason, so the history shows who took it away and why.
 *   Until saved the mark can be undone. Nothing here edits a rule or adds one: consent is given
 *   only in the needs-you dock, on the exact call. Project rules that deny still beat these, so
 *   an approval can never open what a deny closed.
 *
 * Exports: ToolApprovalsSection.
 * Depends on: lucide-react, components/ticket/ticket-link, components/ui/*, domain/format-time,
 *   domain/permission-copy, routes/project-settings/use-project-settings-context.
 */

import { ShieldCheck } from 'lucide-react';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { Button } from '#/components/ui/button.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { formatWhen } from '#/domain/format-time.js';
import { approvedRuleWords } from '#/domain/permission-copy.js';
import { useProjectSettingsContext } from '#/routes/project-settings/use-project-settings-context.js';

export function ToolApprovalsSection() {
  const { slug, opened, draft, onChange, saving } = useProjectSettingsContext();
  const rules = opened.config.project.tool_grants?.approved ?? [];

  const toggle = (id: string): void => {
    onChange({
      ...draft,
      revoked: draft.revoked.includes(id)
        ? draft.revoked.filter((other) => other !== id)
        : [...draft.revoked, id],
    });
  };

  return (
    <section aria-labelledby="approvals-heading" className="grid gap-3">
      <h2 id="approvals-heading" className="text-base font-semibold">
        Tool approvals
      </h2>
      <p className="max-w-prose text-sm text-muted">
        Steps you chose to allow for this whole project, so Workers do not ask again. You
        can only take one back here. To allow a new one, answer it when a Worker asks.
      </p>

      {rules.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing is always allowed"
          variant="compact"
        >
          When a Worker asks to run something and you pick “Always for this project”, it
          is listed here, and you can take it back.
        </EmptyState>
      ) : (
        <ul
          aria-label="Always-allowed steps"
          className="grid divide-y divide-line rounded-xl border border-line bg-surface"
        >
          {rules.map((rule) => {
            const marked = draft.revoked.includes(rule.id);

            return (
              <li
                key={rule.id}
                className="flex flex-wrap items-start justify-between gap-3 p-4"
              >
                <div className="grid min-w-0 gap-1">
                  <p
                    className={`min-w-0 break-words text-sm font-medium ${marked ? 'text-muted line-through' : ''}`}
                  >
                    {approvedRuleWords(rule)}
                  </p>
                  <p className="min-w-0 break-words text-xs text-muted">
                    Allowed from <TicketLink id={rule.source.ticket_id} slug={slug} /> on{' '}
                    <time dateTime={rule.created_at}>{formatWhen(rule.created_at)}</time>
                  </p>
                  {marked ? (
                    <p className="text-xs font-medium text-attn">
                      Will be revoked when you save. Say why in the box below.
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="quiet"
                  disabled={saving}
                  aria-pressed={marked}
                  aria-label={`${marked ? 'Keep' : 'Revoke'}: ${approvedRuleWords(rule)}`}
                  onClick={() => toggle(rule.id)}
                >
                  {marked ? 'Keep it' : 'Revoke'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
