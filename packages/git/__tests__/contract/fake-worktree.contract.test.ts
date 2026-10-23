/**
 * Pins: the in-memory fake worktree manager satisfies the WorktreeManager contract.
 *
 * Why: the engine is tested against this fake, not real git. The contract is only
 *   trustworthy if the simple fake passes it, so a failure here means the fake has
 *   drifted from what the engine may rely on.
 *
 * Depends on: contract/{worktree,merge-in}.contract, helpers/fake-worktree.
 */

import { describeMergeInContract } from '#tests/contract/merge-in.contract.js';
import { describeWorktreeContract } from '#tests/contract/worktree.contract.js';
import { createFakeWorktreeHarness } from '#tests/helpers/fake-worktree.js';

describeWorktreeContract('fake', async () => createFakeWorktreeHarness());
describeMergeInContract('fake', async () => createFakeWorktreeHarness());
