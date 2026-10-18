/**
 * StageCheck: what the Director's check against the plan found: each acceptance criterion and the
 * files the plan did not name.
 *
 * Why: the Director check reads only typed facts (the plan, the diff, the reports), never the
 *   Worker's own account, and answers per criterion whether the work meets it. The owner who
 *   wonders why a ticket was held, or why the Director would not sign, needs those answers
 *   one by one with their evidence: "Met", "Not met" or "Unclear" in words, and the changed files
 *   outside the plan, which is what raises a scope-drift hold. Its findings use the shared list.
 *
 * Exports: StageCheck.
 * Depends on: components/ticket/findings-list, domain/finished-work-copy, domain/stage-view-copy,
 *   schemas/pipelines (type).
 */

import { FindingsList } from '#/components/ticket/findings-list.js';
import { unplannedLine } from '#/domain/finished-work-copy.js';
import { ACCEPTANCE_WORDS } from '#/domain/stage-view-copy.js';
import type { StageView } from '#/schemas/pipelines.js';

export function StageCheck(props: { view: StageView }) {
  const { check, unplanned = [] } = props.view;

  if (check === undefined && unplanned.length === 0) {
    return null;
  }

  return (
    <div className="grid min-w-0 gap-3">
      {check === undefined ? null : (
        <>
          <p className="max-w-prose text-sm">{check.summary}</p>
          {check.acceptance.length === 0 ? null : (
            <ul aria-label="Acceptance criteria" className="grid gap-2">
              {check.acceptance.map((item, index) => (
                <li
                  key={`${index}-${item.criterion}`}
                  className={`grid min-w-0 gap-0.5 rounded-lg border p-3 text-sm ${
                    item.met === 'yes'
                      ? 'border-line bg-surface'
                      : item.met === 'no'
                        ? 'border-danger bg-danger-soft'
                        : 'border-attn bg-attn-soft'
                  }`}
                >
                  <p className="min-w-0 break-words">
                    <span className="font-semibold">{ACCEPTANCE_WORDS[item.met]}</span>
                    {': '}
                    {item.criterion}
                  </p>
                  <p className="min-w-0 break-words text-xs text-muted">
                    {item.evidence}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {unplanned.length === 0 ? null : (
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
      )}
      {check === undefined ? null : (
        <FindingsList findings={check.findings} label="Director check findings" />
      )}
    </div>
  );
}
