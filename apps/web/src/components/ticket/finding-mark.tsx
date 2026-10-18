/**
 * FindingMarkToggle: "Real" / "False alarm" on one finding, clearable, with a plain error if the save fails.
 *
 * Why: the owner is the only one who knows whether a check was right, and that verdict is what
 *   the scorecards weigh above every guess. So each finding offers two buttons; pressing the one
 *   already pressed clears the mark, so a slip is undone in one click. The buttons are real
 *   buttons in a labelled group (keyboard and screen readers work unscripted), the state is a
 *   word and `aria-pressed` (never colour alone), and the change shows at once and is put back
 *   with a sentence if the server refuses (api/use-finding-marks).
 *
 * Exports: FindingMarkToggle.
 * Depends on: api/use-finding-marks, api/describe-error, domain/finding-marks, @forge/core (types).
 */

import type { FindingVerdict } from '@forge/core';
import { describeError } from '#/api/describe-error.js';
import { useMarkFinding } from '#/api/use-finding-marks.js';
import { VERDICT_LABEL } from '#/domain/finding-marks.js';

const ORDER: readonly FindingVerdict[] = ['real', 'false_alarm'];

export function FindingMarkToggle(props: {
  ticketId: string;
  rowId: number;
  index: number;
  verdict: FindingVerdict | undefined;
}) {
  const mark = useMarkFinding(props.ticketId);
  const label = `Is finding ${props.index + 1} real?`;

  return (
    <div className="grid gap-1">
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs text-muted">Your verdict</span>
        {ORDER.map((verdict) => {
          const on = props.verdict === verdict;

          return (
            <button
              key={verdict}
              type="button"
              aria-pressed={on}
              onClick={() =>
                mark.mutate({
                  rowId: props.rowId,
                  index: props.index,
                  verdict: on ? null : verdict,
                })
              }
              className={`min-h-9 rounded-lg border px-2.5 text-xs font-medium transition-[background-color,color,transform] duration-150 active:translate-y-px ${
                on
                  ? 'border-transparent bg-signal text-on-signal'
                  : 'border-line bg-surface text-muted hover:bg-hover hover:text-fg'
              }`}
            >
              {VERDICT_LABEL[verdict]}
            </button>
          );
        })}
      </div>
      {mark.isError ? (
        <p role="alert" className="text-xs text-danger">
          {`Your verdict was not saved. ${describeError(mark.error).detail}`}
        </p>
      ) : null}
    </div>
  );
}
