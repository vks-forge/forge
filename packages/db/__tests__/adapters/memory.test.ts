/**
 * Pins the in-memory StorageAdapter against the shared storage contract.
 *
 * Why: a second implementation proves the StorageAdapter seam (m0-brief.md Slice 1 exit).
 *
 * Pins: contract behaviour of createMemoryStorage().
 * Depends on: contract/storage.contract, src/index.
 */

import { createMemoryStorage } from '#/index.js';
import { describeStorageContract } from '#tests/contract/storage.contract.js';

describeStorageContract('memory', () => createMemoryStorage());
