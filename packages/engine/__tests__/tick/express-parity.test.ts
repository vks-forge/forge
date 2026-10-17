/**
 * Pins that an Express dispatch with built-in agents asks the harness for exactly what it did
 * before agents existed.
 *
 * Why: Express runs the effective `implementer` agent, and a fresh install must behave like
 *   the pre-agent engine: same prompt, same model from the lane matrix, same budget, same
 *   environment. A drift here would change what every existing owner's Workers are told and
 *   what they spend, with no setting touched. The golden fixture was captured from the engine
 *   before agents were wired in; the cases after the first show where the model still comes
 *   from (the company lane matrix) when the owner changed it.
 *
 * Pins: the whole RunRequest field by field, the run row's agent record, the matrix override.
 * Depends on: helpers/rig, fixtures/express-dispatch.golden.json, vitest.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeRig } from '#tests/helpers/rig.js';

const GOLDEN = JSON.parse(
  readFileSync(
    new URL('../fixtures/express-dispatch.golden.json', import.meta.url),
    'utf8',
  ),
) as Record<string, unknown>;

describe('Express parity with built-in agents', () => {
  it('builds a RunRequest equal to the one captured before agents existed', async () => {
    const rig = await makeRig();
    await rig.request('Fix the doctor check');
    await rig.tick();

    const req = rig.driver.starts[0];

    expect(req).toEqual(GOLDEN);
    for (const key of Object.keys(GOLDEN)) {
      expect(req?.[key as keyof typeof req], key).toEqual(GOLDEN[key]);
    }
  });

  it('runs on the harness the project names', async () => {
    const rig = await makeRig();
    await rig.request('Fix the doctor check');
    await rig.tick();

    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));

    expect(run?.harness).toBe('scripted');
  });

  it('records the implementer agent and its hash on the run', async () => {
    const rig = await makeRig();
    await rig.request('Fix the doctor check');
    await rig.tick();

    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));

    expect(run?.agent_id).toBe('implementer');
    expect(run?.agent_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('still takes the model from the company lane matrix when the owner changed it', async () => {
    const rig = await makeRig();
    await rig.config.append({
      scope: 'company',
      doc: { models: { worker: { express: 'opus' } } },
      author: 'test',
      reason: 'lane model override',
      expectedVersion: 0,
    });

    await rig.request('Fix the doctor check');
    await rig.tick();

    expect(rig.driver.starts[0]?.model).toBe('opus');
  });
});
