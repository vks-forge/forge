/**
 * Pins how one agent's history is read off the versions of a scope.
 *
 * Why: the owner asks who changed an agent, when and why, and the answer must not be stored a
 *   second time (two logs can disagree). The history is derived: each version is compared with the
 *   one before for this agent alone, and the kind of change is read from what the document says.
 *   A built-in has no key until it is first edited, so its first save is an edit, not a creation.
 *
 * Pins: created, edited, archived, unarchived and reset; versions that did not touch the agent are
 *   skipped; a first edit of a built-in; disable and enable in a project scope; author, reason, time.
 * Depends on: src/domain/agent-history, agent-doc, builtin-agents, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  addCompanyAgent,
  resetCompanyAgent,
  setProjectDisabled,
  storeCompanyAgent,
} from '#/domain/agent-doc.js';
import { agentHistory } from '#/domain/agent-history.js';
import { BUILTIN_AGENTS } from '#/domain/builtin-agents.js';
import type { AgentDefinition } from '#/schemas/agent.js';
import type { ConfigVersion } from '#/schemas/config-override.js';

const reviewer = BUILTIN_AGENTS['reviewer'] as AgentDefinition;

const mine: AgentDefinition = {
  ...(BUILTIN_AGENTS['implementer'] as AgentDefinition),
  name: 'Mine',
  origin: 'custom',
  runs_on: {
    harness: 'project_default',
    model: { kind: 'harness_default' },
    fallbacks: [],
  },
};

describe('agentHistory', () => {
  const v = (
    version: number,
    doc: ConfigVersion['doc'],
    reason = 'r',
    scope: 'company' | 'project' = 'company',
  ): ConfigVersion =>
    ({
      id: version,
      scope,
      project: scope === 'project' ? 'forge' : null,
      version,
      doc,
      author: 'owner',
      reason,
      created_at: version * 1000,
    }) as ConfigVersion;

  it('reads created, edited, archived, unarchived and reset off the versions of one agent', () => {
    const created = addCompanyAgent({}, 'mine', mine);
    const edited = storeCompanyAgent(created, 'mine', { ...mine, instructions: 'x' });
    const archived = storeCompanyAgent(edited, 'mine', {
      ...mine,
      instructions: 'x',
      archived: true,
    });

    const restored = storeCompanyAgent(archived, 'mine', { ...mine, instructions: 'x' });
    const reset = resetCompanyAgent(restored, 'mine');

    const history = agentHistory(
      [
        v(1, created),
        v(2, { models: { worker: { express: 'opus' } }, ...edited }),
        v(3, archived),
        v(4, restored),
        v(5, reset),
      ],
      'mine',
    );

    expect(history.map((h) => [h.version, h.change])).toEqual([
      [1, 'created'],
      [2, 'edited'],
      [3, 'archived'],
      [4, 'unarchived'],
      [5, 'reset'],
    ]);
  });

  it('skips versions that did not touch the agent', () => {
    const doc = addCompanyAgent({}, 'mine', mine);

    expect(
      agentHistory(
        [v(1, doc), v(2, { ...doc, models: { worker: { full: 'opus' } } })],
        'mine',
      ),
    ).toHaveLength(1);
  });

  it('reads a first edit of a built-in as edited, not created', () => {
    const doc = storeCompanyAgent({}, 'reviewer', { ...reviewer, instructions: 'x' });

    expect(agentHistory([v(1, doc)], 'reviewer').map((h) => h.change)).toEqual([
      'edited',
    ]);
  });

  it('reads disable and enable in a project scope', () => {
    const off = setProjectDisabled({}, 'critic', true);
    const on = setProjectDisabled(off, 'critic', false);

    expect(
      agentHistory([v(1, off, 'r', 'project'), v(2, on, 'r', 'project')], 'critic').map(
        (h) => h.change,
      ),
    ).toEqual(['disabled', 'enabled']);
  });

  it('carries author, reason and time', () => {
    const doc = addCompanyAgent({}, 'mine', mine);

    expect(agentHistory([v(1, doc, 'because')], 'mine')[0]).toMatchObject({
      version: 1,
      author: 'owner',
      reason: 'because',
      created_at: 1000,
    });
  });
});
