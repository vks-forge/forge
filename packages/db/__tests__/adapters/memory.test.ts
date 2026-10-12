/**
 * Pins the in-memory StorageAdapter against the shared storage contract.
 *
 * Why: the in-memory adapter is what engine tests run on; if it diverged from sqlite
 *   those tests would pass against behaviour production never has. Running the shared
 *   contract against it keeps the two interchangeable.
 *
 * Pins: contract behaviour of createMemoryStorage().
 * Depends on: contract/storage.contract, src/index.
 */

import { createMemoryStorage } from '#/index.js';
import { describeStorageContract } from '#tests/contract/storage.contract.js';

describeStorageContract('memory', () => createMemoryStorage());
