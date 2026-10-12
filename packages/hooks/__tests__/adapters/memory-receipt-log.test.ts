/**
 * Pins: a failed append leaves no receipts and does not block later appends.
 *
 * Why: a half-written decision/effect pair would break the chain for the whole run.
 *
 * Depends on: src/adapters/memory-receipt-log.
 */

import { describe, expect, it } from 'vitest';
import { createMemoryReceiptLog } from '#/index.js';

describe('memory receipt log', () => {
  it('discards a throwing build and keeps serving the run', async () => {
    const log = createMemoryReceiptLog();
    await expect(
      log.append('r', () => {
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    await expect(log.append('r', () => [])).resolves.toEqual([]);
    expect(await log.list('r')).toEqual([]);
  });
});
