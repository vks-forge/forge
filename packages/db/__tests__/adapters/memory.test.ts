/**
 * Pins the in-memory StorageAdapter against the shared storage contract.
 *
 * Why: the in-memory adapter is what engine tests run on; if it diverged from sqlite
 *   those tests would pass against behaviour production never has. Running the shared
 *   contract against it keeps the two interchangeable.
 *
 * Pins: contract behaviour of createMemoryStorage() and createMemoryReceiptLog().
 * Depends on: contract/storage.contract, contract/receipt-log.contract, src/index.
 */

import { createMemoryReceiptLog, createMemoryStorage } from '#/index.js';
import { describeReceiptLogContract } from '#tests/contract/receipt-log.contract.js';
import { describeStorageContract } from '#tests/contract/storage.contract.js';

describeStorageContract('memory', () => createMemoryStorage());
describeReceiptLogContract('memory', () => ({
  log: createMemoryReceiptLog(),
  close: async () => undefined,
}));
