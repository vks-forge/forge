/**
 * Pins the in-memory StorageAdapter against the shared storage contract.
 *
 * Why: the in-memory adapter is what engine tests run on; if it diverged from sqlite
 *   those tests would pass against behaviour production never has. Running the shared
 *   contract against it keeps the two interchangeable.
 *
 * Pins: contract behaviour of createMemoryStorage(), createMemoryReceiptLog() and
 *   createMemoryConfigSource().
 * Depends on: contract/storage.contract, contract/receipt-log.contract,
 *   contract/config-source.contract, src/index.
 */

import {
  createMemoryConfigSource,
  createMemoryReceiptLog,
  createMemoryStorage,
} from '#/index.js';
import { describeConfigSourceContract } from '#tests/contract/config-source.contract.js';
import { describeReceiptLogContract } from '#tests/contract/receipt-log.contract.js';
import { describeStorageContract } from '#tests/contract/storage.contract.js';

describeStorageContract('memory', () => createMemoryStorage());
describeReceiptLogContract('memory', () => ({
  log: createMemoryReceiptLog(),
  close: async () => undefined,
}));

describeConfigSourceContract('memory', () => ({
  source: createMemoryConfigSource(),
  close: () => undefined,
}));
