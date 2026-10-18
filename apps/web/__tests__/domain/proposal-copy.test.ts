/**
 * Pins: the words of a pipeline proposal (headline with lane and change, how often the Director made
 * it, what accepting does) and one honest sentence for every way deciding it can be refused, chosen by
 * the server's error code and never its message.
 *
 * Why: accepting rewrites a standing lane. If a stale proposal read as a generic error the owner might
 * retry for nothing, and a version conflict that blamed the owner's rules would send them the wrong way.
 * Depends on: domain/proposal-copy, api/api-error, helpers/forge-data/proposal-data.
 */

import { describe, expect, it } from 'vitest';
import { ApiError } from '#/api/api-error.js';
import {
  STALE_WORDS,
  describeProposalError,
  proposalCount,
  proposalHeadline,
  ruleTargetWords,
} from '#/domain/proposal-copy.js';
import { addReviewerProposal } from '#tests/helpers/forge-data/proposal-data.js';

const refused = (code: string, body: unknown = {}) =>
  new ApiError('http', `server says ${code}`, { status: 409, code, body });

describe('proposal words', () => {
  it('names the lane and the change', () => {
    expect(proposalHeadline(addReviewerProposal())).toBe(
      'Standard lane: Add Security review after g1',
    );
  });

  it('counts the tickets, singular too', () => {
    expect(proposalCount({ count: 3 })).toBe(
      'The Director made this change on 3 tickets of this project.',
    );

    expect(proposalCount({ count: 1 })).toBe(
      'The Director made this change on 1 ticket of this project.',
    );
  });

  it('says accepting changes new tickets only', () => {
    expect(ruleTargetWords('full')).toMatch(
      /^Every new ticket in the Full lane of this project/,
    );

    expect(ruleTargetWords('full')).toMatch(/Tickets already started keep the pipeline/);
  });
});

describe('describeProposalError', () => {
  it('says a stale lane applied nothing', () => {
    expect(describeProposalError(refused('proposal_stale'))).toBe(STALE_WORDS);
  });

  it('says a decided one was already decided', () => {
    expect(describeProposalError(refused('not_pending'))).toMatch(/already decided/);
  });

  it('blames a concurrent save for a version conflict and says nothing was applied', () => {
    const words = describeProposalError(refused('version_conflict'));

    expect(words).toMatch(/Someone changed this project’s settings/);
    expect(words).toMatch(/nothing was applied/);
  });

  it('says a vanished proposal or project no longer exists', () => {
    expect(describeProposalError(refused('proposal_not_found'))).toMatch(
      /no longer exists/,
    );

    expect(describeProposalError(refused('project_not_found'))).toMatch(
      /no longer exists/,
    );
  });

  it('says the rules no longer hold, adding the first problem in words', () => {
    const words = describeProposalError(
      refused('pipeline_invalid', {
        error: { problems: [{ code: 'g1_missing', message: 'x' }] },
      }),
    );

    expect(words).toMatch(
      /no longer passes the pipeline rules, so nothing was applied\./,
    );

    expect(words).toMatch(/The independent gate G1 is missing/);
  });

  it('says the rules no longer hold even with no problems attached', () => {
    expect(describeProposalError(refused('pipeline_invalid'))).toMatch(
      /no longer passes the pipeline rules/,
    );
  });

  it('explains a reason that is too short', () => {
    expect(describeProposalError(refused('invalid_request'))).toMatch(
      /at least 3 characters/,
    );
  });

  it('falls back to the generic words for a network failure or an unknown code', () => {
    const network = new ApiError('network', 'down');

    expect(describeProposalError(network)).toMatch(/^Cannot reach Forge\./);
    expect(describeProposalError(refused('something_new'))).toMatch(
      /^Forge reported a problem\./,
    );

    expect(describeProposalError('boom')).toMatch(/^Something went wrong\./);
  });
});
