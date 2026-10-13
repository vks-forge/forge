/**
 * Pins: the reference fake DirectorLLM satisfies the DirectorLLM contract.
 *
 * Why: the contract is only trustworthy if something simple passes it. The fake is the
 * smallest correct implementation, so a failure here means the contract is wrong, not an
 * adapter.
 *
 * Depends on: contract/director-llm.contract, helpers/fake-director-llm.
 */

import { describeDirectorLLMContract } from '#tests/contract/director-llm.contract.js';
import { createFakeDirectorLLM } from '#tests/helpers/fake-director-llm.js';

describeDirectorLLMContract('fake', async () => {
  const fake = createFakeDirectorLLM();
  return {
    llm: fake.llm,
    script: (r) => fake.script(r),
    now: () => Date.now(),
    close: async () => undefined,
  };
});
