/**
 * Plain words: the one glossary of owner-facing terms, each with a one-line label and a short
 * explanation.
 *
 * Why: the owner does not code. Screens used to leak internal names (a gate called G1, a
 *   "lane" and a "tier", "generation", "driver", "next tick", raw `in_progress`), each spelled
 *   differently where it appeared. This module is the single place that names a term for the
 *   owner and says what it means, so the header, the KPI tile, the run facts and the settings
 *   hint use the same words, and the "what's this" popover (components/ui/whats-this) reads its
 *   text from here. It composes the existing label maps (lane, tier, state); it never copies them.
 *
 * Exports: TERM, APPLY_TIMING, stateLabel(), careWords(), careGloss(), riskWords(), careAndRisk().
 * Depends on: domain/pipeline-copy, domain/finished-work-copy, domain/board-columns, types/plain-words.types. Pure.
 */

import type { Lane, Tier, TicketStatus } from '@forge/core';
import { STATE_LABEL } from '#/domain/board-columns.js';
import { TIER_WORDS } from '#/domain/finished-work-copy.js';
import { LANE_BLURB, LANE_LABEL, LANE_ORDER } from '#/domain/pipeline-copy.js';
import type { Term, TermId } from '#/types/plain-words.types.js';

const CARE_EXPLAIN = LANE_ORDER.map(
  (lane) => `${LANE_LABEL[lane]}: ${LANE_BLURB[lane]}`,
).join(' ');

export const TERM: Readonly<Record<TermId, Term>> = {
  check: {
    id: 'check',
    label: 'Independent check',
    explain:
      "A separate AI reviewer, not the one that did the work, checks the change against what was asked, using the project's own checks such as its tests.",
  },
  care: {
    id: 'care',
    label: 'Care level',
    explain: `How much checking a ticket gets. ${CARE_EXPLAIN}`,
  },
  risk: {
    id: 'risk',
    label: 'Risk',
    explain: `How risky the change is, judged from the files it touches: ${TIER_WORDS.A.toLowerCase()}, ${TIER_WORDS.B.toLowerCase()}, or ${TIER_WORDS.C.toLowerCase()} (auth, migrations, secrets, billing). The Director signs off protected files only when every check passed and no secret file is touched; otherwise you do.`,
  },
  attempt: {
    id: 'attempt',
    label: 'Attempt',
    explain:
      'Which try this run belongs to. A ticket is tried again after a failed check or a send-back, and each try is a new attempt.',
  },
  connector: {
    id: 'connector',
    label: 'Connector version',
    explain:
      "The version of Forge's connector to the AI coding tool that did this run. It matters when a result looks odd after an update.",
  },
  tool: {
    id: 'tool',
    label: 'AI coding tool',
    explain: 'The program that does the work, such as Claude Code or Codex.',
  },
  tool_session: {
    id: 'tool_session',
    label: 'Tool session',
    explain:
      'The conversation the AI coding tool kept for this run. Forge uses it to resume the same run instead of starting over.',
  },
  cache: {
    id: 'cache',
    label: 'Re-read from cache',
    explain:
      'Text the model had already read and read again from its cache, billed at a lower rate than new text.',
  },
  safety_minimum: {
    id: 'safety_minimum',
    label: 'Safety minimum',
    explain:
      'The checks every plan must include whatever the project asks for, such as tests for changed behaviour. A plan below it cannot start.',
  },
  director: {
    id: 'director',
    label: 'Director (planning and answering)',
    explain:
      'The AI that talks with you, plans the work, answers the Workers’ questions and checks results. Its model calls cost money too, separately from the Workers that write the code.',
  },
};

/** Said wherever a setting is saved: the owner needs to know when it applies and that nothing restarts. */
export const APPLY_TIMING =
  "Changes take effect on the Director's next check, usually within a minute. No restart needed.";

/** The owner's word for a ticket state ("In progress"), never the stored `in_progress`. */
export function stateLabel(status: TicketStatus): string {
  return STATE_LABEL[status];
}

/** "Standard care": the lane in words. */
export function careWords(lane: Lane): string {
  return `${LANE_LABEL[lane]} care`;
}

/** "moderate risk" / "protected files": the tier in words. */
export function riskWords(tier: Tier): string {
  return TIER_WORDS[tier].toLowerCase();
}

/** What a care level means in one sentence (the lane's own blurb, so the pipeline editor and plan editor agree). */
export function careGloss(lane: Lane): string {
  return LANE_BLURB[lane];
}

/** "Standard care · moderate risk": the ticket header's detail. */
export function careAndRisk(lane: Lane, tier: Tier): string {
  return `${careWords(lane)} · ${riskWords(tier)}`;
}
