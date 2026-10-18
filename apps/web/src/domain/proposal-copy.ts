/**
 * Proposal copy: the words of a Director pipeline proposal and of every way deciding one can be refused.
 *
 * Why: the Director suggests a standing change to a project's lane after making the same change
 *   on several tickets. The owner is deciding whether every future ticket of that lane changes, so
 *   the headline names the lane and the change, the reason line says how often it happened, and a
 *   refusal is explained from the server's error code (never its message) with what to do next:
 *   a lane that changed since is "nothing was applied", a version conflict says someone else saved
 *   first, rules that no longer hold say so. Pure.
 *
 * Exports: proposalHeadline(), proposalCount(), describeProposalError(), STALE_WORDS, ruleTargetWords().
 * Depends on: api/api-error, api/describe-error, domain/director-change-copy, domain/pipeline-copy,
 *   @forge/core (types).
 */

import type { PipelineProposalView } from '@forge/core';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { opWords } from '#/domain/director-change-copy.js';
import { LANE_LABEL, problemsOf, problemWords } from '#/domain/pipeline-copy.js';

export const STALE_WORDS = 'The lane changed since; nothing was applied.';

/** "Standard lane: Add Security review after g1". */
export function proposalHeadline(
  proposal: Pick<PipelineProposalView, 'lane' | 'op'>,
): string {
  return `${LANE_LABEL[proposal.lane]} lane: ${opWords(proposal.op)}`;
}

/** "The Director made this change on 3 tickets." */
export function proposalCount(proposal: Pick<PipelineProposalView, 'count'>): string {
  return `The Director made this change on ${proposal.count} ticket${proposal.count === 1 ? '' : 's'} of this project.`;
}

/** What accepting does, said before the owner confirms. */
export function ruleTargetWords(lane: PipelineProposalView['lane']): string {
  return `Every new ticket in the ${LANE_LABEL[lane]} lane of this project will follow the list below. Tickets already started keep the pipeline they began with.`;
}

/** Why deciding a proposal was refused, in words, from the server's error code. */
export function describeProposalError(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'http') {
    switch (error.code) {
      case 'proposal_stale':
        return STALE_WORDS;
      case 'not_pending':
        return 'This suggestion was already decided, so nothing more was sent.';
      case 'version_conflict':
        return 'Someone changed this project’s settings after this page loaded, so nothing was applied. The page is refreshing; look again and decide.';
      case 'proposal_not_found':
      case 'project_not_found':
        return 'This suggestion no longer exists. The page is refreshing.';
      case 'pipeline_invalid': {
        const first = problemsOf(error)[0];

        return `The change no longer passes the pipeline rules, so nothing was applied.${
          first === undefined ? '' : ` ${problemWords(first)}`
        }`;
      }

      case 'invalid_request':
        return 'Forge did not accept this. A reason needs at least 3 characters.';
      default:
        break;
    }
  }

  const { title, detail } = describeError(error);

  return `${title}. ${detail}`;
}
