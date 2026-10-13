/**
 * Pins: the Claude DirectorLLM adapter satisfies the DirectorLLM contract.
 *
 * Why: the Director must treat every model failure the same whichever backend answered.
 * The adapter runs against a fake `claude` that prints the JSON documents the real CLI
 * prints, including the array form with a rate-limit event, a budget stop that exits 0 and
 * a process that dies with no document, so each row of the StepError table is exercised
 * through a real child process.
 *
 * Depends on: contract/director-llm.contract, helpers/director-llm-rig.
 */

import { describeDirectorLLMContract } from '#tests/contract/director-llm.contract.js';
import { makeDirectorRig } from '#tests/helpers/director-llm-rig.js';

describeDirectorLLMContract('Claude adapter', async () => makeDirectorRig());
