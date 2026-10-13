/**
 * Pins: the reference fake driver satisfies the WorkerDriver contract.
 *
 * Why: the contract is only trustworthy if something simple passes it. The fake is the
 * smallest correct driver, so a failure here means the contract is wrong, not a harness.
 *
 * Depends on: contract/worker-driver.contract, helpers/fake-driver, helpers/run-request.
 */

import { describeWorkerDriverContract } from '#tests/contract/worker-driver.contract.js';
import { createFakeDriver } from '#tests/helpers/fake-driver.js';
import { makeRequest } from '#tests/helpers/run-request.js';

describeWorkerDriverContract('fake driver', async () => {
  const fake = createFakeDriver();
  return {
    driver: fake.driver,
    request: (over) => makeRequest(over),
    scriptSuccess: () => undefined,
    scriptHang: () => fake.hangNext(),
    close: async () => undefined,
  };
});
