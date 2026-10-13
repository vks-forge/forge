/**
 * Pins: the CLI engine's receipt cross-check and cancel.
 *
 * Why: the cross-check kills a Worker whose tool call has no policy receipt (the hook was
 * bypassed), and cancel must end the real child process; either failing leaves a Worker
 * running outside policy or after the Director gave up on it.
 *
 * Depends on: helpers/claude-rigs (runs helpers/fake-claude.mjs under node), helpers/cli-run,
 *   helpers/wait-for.
 */

import { describe, expect, it } from 'vitest';
import { makeCliRig, STREAM } from '#tests/helpers/claude-rigs.js';
import { waitFor } from '#tests/helpers/wait-for.js';

describe('CLI engine: receipt cross-check', { timeout: 30_000 }, () => {
  it('cancels as policy_denied when a tool_use has no receipt within the grace window', async () => {
    const rig = makeCliRig();
    rig.receipts.allowAll = false;
    rig.fixture([STREAM.init, STREAM.toolUse('ghost')], { hang: true });
    const h = await rig.driver.start(rig.request());
    await waitFor(() => rig.receipts.asked.length > 0, 'receipt lookup');
    await rig.clock.advance(3_000);
    expect(await rig.driver.result(h)).toMatchObject({
      status: 'error',
      errorFamily: 'policy_denied',
    });
  });

  it('accepts a tool_use the hook recorded under the same id', async () => {
    const rig = makeCliRig();
    rig.receipts.allowAll = false;
    rig.receipts.record('tu1', 'allow');
    rig.fixture([
      STREAM.init,
      STREAM.toolUse('tu1'),
      STREAM.toolResult('tu1'),
      STREAM.result(),
    ]);

    const h = await rig.driver.start(rig.request());
    await waitFor(() => rig.receipts.asked.length > 0, 'receipt lookup');
    expect((await rig.driver.result(h)).status).toBe('success');
  });
});

describe('CLI engine: cancel', { timeout: 30_000 }, () => {
  it('terminates the process and reports cancelled', async () => {
    const rig = makeCliRig();
    rig.scriptHang();
    const h = await rig.driver.start(rig.request());
    await rig.driver.cancel(h);
    expect((await rig.driver.result(h)).status).toBe('cancelled');
  });
});
