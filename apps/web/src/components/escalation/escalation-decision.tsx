/**
 * EscalationDecision: a held ticket's choice, with what was found and what each way forward does.
 *
 * Why: when a check found blocking problems it will not send back again, or the work grew past
 *   its plan, the ticket is held and only the owner may move it (d-0135). The owner needs the
 *   evidence in front of them to choose: the findings worst first with `file:line`, how often it
 *   was already sent back, and for scope drift the files the plan did not name. The sentence
 *   above says what is at stake (the gates passed; merging anyway is the owner's call). The
 *   buttons are the shared action bar, and the card draws this the same in the chat, on the
 *   Ticket page and in the Inbox.
 *
 * Exports: EscalationDecision.
 * Depends on: components/ticket/findings-list, domain/finished-work-copy, types/escalation-ui.types.
 */

import { FindingsList } from '#/components/ticket/findings-list.js';
import { DECISION_LEAD, reworkLine, unplannedLine } from '#/domain/finished-work-copy.js';
import type { DecisionPayload } from '#/types/escalation-ui.types.js';

export function EscalationDecision(props: { decision: DecisionPayload }) {
  const { decision } = props;
  const sentBack = reworkLine(decision.rework);
  const unplanned = decision.unplanned ?? [];

  return (
    <div className="grid min-w-0 gap-3">
      <p className="min-w-0 whitespace-pre-wrap break-words text-base">
        {decision.summary}
      </p>
      <p className="text-sm text-muted">{DECISION_LEAD[decision.cause]}</p>
      <FindingsList
        findings={decision.findings}
        label={`Findings from ${decision.stage_label}`}
      />
      {unplanned.length > 0 ? (
        <div className="grid gap-1">
          <p className="text-sm font-medium">{unplannedLine(unplanned.length)}</p>
          <ul aria-label="Files the plan did not name" className="grid gap-0.5">
            {unplanned.map((file) => (
              <li key={file} className="min-w-0 break-all font-data text-xs">
                {file}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {sentBack === null ? null : <p className="text-xs text-muted">{sentBack}</p>}
    </div>
  );
}
