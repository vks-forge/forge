/**
 * Scenario: a survey must read the code before it reports, and the grill hears when it could not.
 *
 * Why: the survey is what keeps the grill from asking the owner what the repository already
 *   answers. In the eval it answered on its first turn without opening a file (T2) and the owner
 *   was asked questions the code could have settled. The survey is now shown the tracked file list,
 *   an answer that read nothing is sent back as a read round, and one that still read nothing is
 *   kept but marked, so the grill says it could not look instead of asking.
 *
 * Pins: the survey step carries the survey-code playbook; round 0 carries `repo_files` and later rounds do not; findings with zero reads while the
 *   repo has files are sent back with `previous_error`; a survey that then reads is accepted
 *   unmarked; one that never reads is stored with `read_nothing` and the grill input carries it;
 *   an empty repository is never held to the rule.
 * Depends on: helpers/planning-rig, helpers/rig, vitest.
 */

import type { CardId } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  TODO_FILES,
  createPlanCard,
  pick,
  planningRig,
  scriptTodo,
} from '#tests/helpers/planning-rig.js';
import type { Rig } from '#tests/helpers/rig.js';

const FINDINGS = {
  findings: { summary: 'A bare project.', predicted_lane: 'standard' },
};

const READ = { read_requests: [{ op: 'read', path: 'package.json' }] };

const surveyOf = async (rig: Rig, id: CardId) =>
  (await rig.storage.transaction((tx) => tx.cardPlanning.get(id))).grill;

describe('survey read guard', () => {
  it('shows round 0 the tracked files and no later round', async () => {
    const rig = await planningRig();
    await createPlanCard(rig);

    await rig.tick();

    const [first, second] = rig.llm.callsTo('card_survey');
    expect(pick(first?.input, 'repo_files')).toEqual(Object.keys(TODO_FILES));
    expect(pick(first?.input, 'repo_files_truncated')).toBe(false);
    expect(pick(second?.input, 'repo_files')).toBeUndefined();
  });

  it('runs the survey on its own playbook, not the one-line prompt alone', async () => {
    const rig = await planningRig();
    await createPlanCard(rig);

    await rig.tick();

    const playbook = rig.llm.callsTo('card_survey')[0]?.input['playbook'] as {
      id: string;
      body: string;
    };

    expect(playbook.id).toBe('survey-code');
    expect(playbook.body).toContain('Read before you answer');
  });

  it('sends back findings that read nothing, and accepts the survey once it reads', async () => {
    const rig = await planningRig();
    scriptTodo(rig, { card_survey: [FINDINGS, READ, FINDINGS] });
    const id = await createPlanCard(rig);

    await rig.tick();

    const calls = rig.llm.callsTo('card_survey');
    expect(calls).toHaveLength(3);
    expect(pick(calls[1]?.input, 'previous_error')).toBe(
      'read the files you need before findings',
    );

    expect(pick(calls[1]?.input, 'read_round')).toBe(1);
    expect(pick(calls[2]?.input, 'previous_error')).toBeUndefined();
    const grill = await surveyOf(rig, id);
    expect(grill.survey?.read_nothing).toBeUndefined();
    expect(grill.files_read.map((f) => f.path)).toContain('package.json');
  });

  it('keeps a survey that never reads but marks it, and the grill input carries the mark', async () => {
    const rig = await planningRig();
    scriptTodo(rig, { card_survey: [FINDINGS] });
    const id = await createPlanCard(rig);

    await rig.tick();

    expect(rig.llm.callsTo('card_survey')).toHaveLength(3);
    const grill = await surveyOf(rig, id);
    expect(grill.survey).toMatchObject({
      summary: 'A bare project.',
      read_nothing: true,
    });

    expect(pick(rig.llm.callsTo('grill_turn')[0]?.input, 'survey.read_nothing')).toBe(
      true,
    );
  });

  it('does not hold a project with no tracked file to the rule', async () => {
    const rig = await planningRig();
    rig.repo.files = {};
    scriptTodo(rig, { card_survey: [FINDINGS] });
    const id = await createPlanCard(rig);

    await rig.tick();

    const calls = rig.llm.callsTo('card_survey');
    expect(calls).toHaveLength(1);
    expect(pick(calls[0]?.input, 'repo_files')).toEqual([]);
    expect((await surveyOf(rig, id)).survey?.read_nothing).toBeUndefined();
  });
});
