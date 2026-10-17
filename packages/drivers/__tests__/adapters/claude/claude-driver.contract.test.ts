/**
 * Pins: both Claude engines satisfy the WorkerDriver contract on fakes.
 *
 * Why: the Director must be able to run a Worker through either engine without knowing
 * which one it got. The ACP engine runs against an in-process fake adapter, the CLI engine
 * against a fake `claude` replaying stream-json; the same contract exercises start,
 * streaming, cancel, resume and steering on both.
 *
 * Depends on: contract/worker-driver.contract, helpers/claude-rigs.
 */

import { describeWorkerDriverContract } from '#tests/contract/worker-driver.contract.js';
import { makeAcpRig, makeCliRig } from '#tests/helpers/claude-rigs.js';

// The probe is a separate short-lived process; adapters/claude/agent-probe.test.ts pins it.
describeWorkerDriverContract('Claude driver, ACP engine', async () => makeAcpRig(), {
  probe: false,
});

describeWorkerDriverContract('Claude driver, CLI engine', async () => makeCliRig(), {
  probe: false,
});
