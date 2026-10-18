/**
 * FindingsList: what a check found, worst first, each with the place it points at and its evidence.
 *
 * Why: the owner decides whether to merge, send back or sign off from the serious findings, and
 *   a bare count ("2 high") tells them nothing to act on. Each finding shows its severity as a
 *   word (never colour alone), the `file:line` to open, what is wrong and the evidence the check
 *   gave, which is required by the schema so no finding is only an opinion. The same list is used
 *   in the held-decision card, the Review tab and a stage's detail, so a finding reads the same
 *   wherever the owner meets it. Where the list comes from a stored review row (`marking`), each
 *   finding also carries the owner's "Real" / "False alarm" toggle; the toggle is keyed by the
 *   finding's position in the check's own list, not its place in the sorted display.
 *
 * Exports: FindingsList.
 * Depends on: components/ticket/finding-mark, domain/finding-marks, domain/finished-work-copy,
 *   domain/pipeline-copy, types/finding-marks.types, @forge/core (type).
 */

import type { Finding } from '@forge/core';
import { FindingMarkToggle } from '#/components/ticket/finding-mark.js';
import { verdictAt } from '#/domain/finding-marks.js';
import { indexedBySeverity, whereOf } from '#/domain/finished-work-copy.js';
import { SEVERITY_LABEL } from '#/domain/pipeline-copy.js';
import type { FindingMarking } from '#/types/finding-marks.types.js';

const TONE: Readonly<Record<Finding['severity'], string>> = {
  critical: 'border-danger bg-danger-soft',
  high: 'border-danger bg-danger-soft',
  medium: 'border-attn bg-attn-soft',
  low: 'border-line bg-surface',
};

export function FindingsList(props: {
  findings: readonly Finding[];
  label: string;
  marking?: FindingMarking | undefined;
}) {
  if (props.findings.length === 0) {
    return null;
  }

  return (
    <ul aria-label={props.label} className="grid min-w-0 gap-2">
      {indexedBySeverity(props.findings).map(({ finding, index }) => {
        const where = whereOf(finding);

        return (
          <li
            key={`${index}-${finding.issue}`}
            className={`grid min-w-0 gap-1 rounded-lg border p-3 text-sm ${TONE[finding.severity]}`}
          >
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-semibold">{SEVERITY_LABEL[finding.severity]}</span>
              {where === '' ? null : (
                <span className="min-w-0 break-all font-data text-xs">{where}</span>
              )}
            </p>
            <p className="min-w-0 break-words">{finding.issue}</p>
            <p className="min-w-0 whitespace-pre-wrap break-words text-xs text-muted">
              {finding.evidence}
            </p>
            {props.marking === undefined ? null : (
              <FindingMarkToggle
                ticketId={props.marking.ticketId}
                rowId={props.marking.rowId}
                index={index}
                verdict={verdictAt(props.marking.marks, index)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
