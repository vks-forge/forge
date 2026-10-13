/**
 * Test rigs that wire `createClaudeDriver` to fakes: a fake ACP agent, or a fake `claude`.
 *
 * Why: the contract and the engine tests need a complete driver (config, ports, clock,
 *   receipts, spawn) in one line, with the fakes still reachable. Tests import both rigs
 *   and the shared stream fixtures from this one place, while each rig lives in its own
 *   file so the ACP and CLI fakes can change independently.
 *
 * Exports: AcpRig, makeAcpRig(), CliRig, makeCliRig(), STREAM, line(), fakeGit().
 * Depends on: helpers/acp-rig, helpers/cli-rig, helpers/rig-base. No IO.
 */

export { makeAcpRig } from '#tests/helpers/acp-rig.js';
export type { AcpRig } from '#tests/helpers/acp-rig.js';
export { STREAM, line, makeCliRig } from '#tests/helpers/cli-rig.js';
export type { CliRig } from '#tests/helpers/cli-rig.js';
export { fakeGit } from '#tests/helpers/rig-base.js';
