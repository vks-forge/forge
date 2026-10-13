/**
 * Runs one CLI-engine Worker to completion against the fake `claude` and collects the outcome.
 *
 * Why: the CLI engine suites all ask the same question of a scripted stream: what result
 * and which events came out. One runner keeps that answer shaped identically across the
 * command-line, result-table and receipt suites.
 *
 * Exports: run().
 * Depends on: @forge/core, helpers/claude-rigs. IO: a real node child process (fake claude).
 */

import { RunEvent } from '@forge/core';
import { makeCliRig } from '#tests/helpers/claude-rigs.js';

export async function run(
  lines: string[],
  opts: { exit?: number; stderr?: string } = {},
  config = {},
) {
  const rig = makeCliRig(config);
  rig.fixture(lines, opts);
  const h = await rig.driver.start(rig.request());
  const result = await rig.driver.result(h);
  const events: RunEvent[] = [];
  for await (const e of rig.driver.events(h)) {
    events.push(e);
  }

  return { rig, result, events };
}
