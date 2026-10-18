/**
 * Pins: the owner-facing words for the end of the fallback chain: the title of a "no agent could run
 * this stage" failure, the help line that names the family that failed and what each way out does, the
 * Retry hint (a restart from the first choice), and the settled line of a Director substitute, which
 * names no button because the owner never had one.
 *
 * Why: this is the screen the owner meets when everything automatic failed. Words that name a code
 * (`model_unavailable`), that promise a Retry that does less than it says, or that credit the owner
 * with the Director's switch would each mislead the one decision left to them.
 * Depends on: domain/escalation-copy, domain/card-escalation-lines, schemas/escalation.
 */

import { describe, expect, it } from 'vitest';
import { escalationLineOf } from '#/domain/card-escalation-lines.js';
import {
  ACTION_LABEL,
  FAILURE_TITLE,
  escalationTitle,
  failureHelp,
  retryHintFor,
  settledLine,
  settledWords,
} from '#/domain/escalation-copy.js';
import { ESCALATION_ACTIONS, FAILURE_CAUSES } from '#/schemas/escalation.js';

describe('no_agent_available copy', () => {
  it('has a plain title, never the code', () => {
    expect(FAILURE_TITLE.no_agent_available()).toBe('No agent could run this stage');
    expect(
      escalationTitle({
        payload: {
          kind: 'failure',
          cause: 'no_agent_available',
          summary: 'x',
          attempts: [],
        },
      }),
    ).toBe('No agent could run this stage');
  });

  it('names the family that failed, in words, and what each way out does', () => {
    expect(failureHelp('no_agent_available', 'model_unavailable')).toMatch(
      /^The model it was set to is not available\. Every place/,
    );

    expect(failureHelp('no_agent_available', 'rate_limit')).toMatch(
      /^The harness kept refusing because of rate limits\. Every place/,
    );

    expect(failureHelp('no_agent_available', undefined)).toMatch(
      /^Every place this agent can run was tried/,
    );

    expect(failureHelp('no_agent_available', 'rate_limit')).toMatch(
      /Retry tries again, Re-plan changes what the ticket needs, Cancel stops it\.$/,
    );
  });

  it('has no help for the causes whose summary says enough', () => {
    for (const cause of FAILURE_CAUSES.filter((c) => c !== 'no_agent_available')) {
      expect(failureHelp(cause, undefined)).toBeUndefined();
    }
  });

  it('says Retry starts again from the first choice, and keeps the rework-cap hint', () => {
    expect(retryHintFor('no_agent_available')).toMatch(
      /starts again from the agent’s first choice/,
    );

    expect(retryHintFor('rework_cap')).toBe('This gives it exactly one more attempt.');
    expect(retryHintFor('retry_cap')).toBeUndefined();
  });
});

describe('substitute copy', () => {
  it('has a label for every action, the engine-only ones included', () => {
    for (const action of ESCALATION_ACTIONS) {
      expect(ACTION_LABEL[action]).toBeTruthy();
    }
  });

  it('credits the Director, not the owner', () => {
    expect(settledWords('substitute', 'director')).toBe(
      'The Director switched to a substitute agent',
    );

    expect(
      settledLine(
        { action: 'substitute', by: 'director', at: '2026-10-18T10:00:00.000Z' },
        Date.parse('2026-10-18T10:05:00.000Z'),
      ),
    ).toMatch(/^The Director switched to a substitute agent · /);
  });

  it('puts the agent and the reason in the card chat line', () => {
    const line = escalationLineOf(
      {
        seq: 1,
        kind: 'escalation_settled',
        at: '2026-10-18T10:00:00.000Z',
        payload: {
          interaction_id: 'int-1',
          ticket_id: 'SVC-4',
          action: 'substitute',
          by: 'director',
          note: 'frontend-writer: same folders, clean record',
        },
      } as never,
      new Set(),
    );

    expect(line?.text).toBe(
      'The Director switched to frontend-writer: same folders, clean record',
    );
  });

  it('falls back to the plain line when the note is missing', () => {
    const line = escalationLineOf(
      {
        seq: 1,
        kind: 'escalation_settled',
        at: '2026-10-18T10:00:00.000Z',
        payload: {
          interaction_id: 'int-1',
          ticket_id: 'SVC-4',
          action: 'substitute',
          by: 'director',
        },
      } as never,
      new Set(),
    );

    expect(line?.text).toBe('The Director switched to a substitute agent');
  });
});
