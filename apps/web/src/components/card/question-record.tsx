/**
 * QuestionRecord: the chat's one-line record of a question the Director asked.
 *
 * Why: the open question and its answer buttons live in the needs-you dock above the message
 *   box (d-0172), so the transcript only keeps the history: what was asked and where it
 *   stands. An open question says it is waiting and points at the box below ("Waiting for your
 *   answer"); an answered one collapses to its words; one the Director moved past says "Not
 *   answered". No buttons here, so the same decision never has two places to be made.
 *
 * Exports: QuestionRecord.
 * Depends on: react, lucide-react, schemas/card-events (type).
 */

import { ArrowDown } from 'lucide-react';
import type { GrillQuestion } from '#/schemas/card-events.js';

const STATE_WORDS = {
  waiting: 'Waiting for your answer',
  answered: 'Answered',
  unanswered: 'Not answered',
} as const;

export function QuestionRecord(props: {
  question: GrillQuestion;
  state: 'waiting' | 'answered' | 'unanswered';
}) {
  const waiting = props.state === 'waiting';

  return (
    <div
      className={`grid max-w-[88%] gap-0.5 border-l-2 pl-3 text-sm ${waiting ? 'border-signal' : 'border-line'}`}
    >
      <p
        className={`flex items-center gap-1 text-xs font-medium ${waiting ? 'text-signal' : 'text-muted'}`}
      >
        {STATE_WORDS[props.state]}
        {waiting ? <ArrowDown aria-hidden="true" className="size-3" /> : null}
      </p>
      <p className={`min-w-0 break-words ${waiting ? 'font-medium' : 'text-muted'}`}>
        {props.question.text}
      </p>
    </div>
  );
}
