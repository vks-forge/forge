/**
 * The mock `memory` resource: sample records that change state when a proposal is answered.
 *
 * Why: the approve and reject flows are optimistic and must roll back on failure, which only
 *   shows if the store really changes and can really refuse. This keeps a session-long copy
 *   of the fixtures. Answering moves a pending proposal to a decision or a rejected record
 *   (the id is kept, like the real writer); answering twice is a 409, like the real route.
 *
 * Exports: createMemoryMock().
 * Depends on: api/api-error, api/mock/memory-fixtures, types/*.
 */

import { ApiError } from '#/api/api-error.js';
import { memoryFixtures } from '#/api/mock/memory-fixtures.js';
import { OWNER } from '#/domain/owner.js';
import type { MemoryApi } from '#/types/memory.types.js';
import type { MockContext } from '#/types/mock.types.js';

export function createMemoryMock(context: MockContext): MemoryApi {
  const records = memoryFixtures();
  const find = (id: string) => records.find((r) => r.id === id);

  async function open(signal: AbortSignal | undefined): Promise<void> {
    await context.delay(signal);
    if (context.scenario === 'error') {
      throw new ApiError('network', 'Cannot reach the Forge server (simulated).');
    }
  }

  return {
    async list(_slug, options) {
      await open(options?.signal);

      return context.scenario === 'empty'
        ? []
        : records.map(({ id, kind, status, statement, tags }) => ({
            id,
            kind,
            status,
            statement,
            tags,
          }));
    },

    async get(_slug, id, options) {
      await open(options?.signal);
      const record = find(id);
      if (!record) {
        throw new ApiError('http', `no memory record ${id}`, {
          status: 404,
          code: 'memory_record_not_found',
        });
      }

      return { ...record };
    },

    async answer(_slug, answer) {
      await open(undefined);
      const record = find(answer.id);
      if (!record) {
        throw new ApiError('http', `no memory record ${answer.id}`, {
          status: 404,
          code: 'memory_record_not_found',
        });
      }

      if (record.status !== 'pending') {
        throw new ApiError('http', `${answer.id} is not a pending proposal`, {
          status: 409,
          code: 'not_a_pending_proposal',
        });
      }

      const today = new Date().toISOString().slice(0, 10);
      if (answer.verdict === 'approve') {
        Object.assign(record, {
          kind: 'decision',
          status: 'active',
          approved_at: today,
          approved_by: OWNER,
        });
      } else {
        Object.assign(record, {
          kind: 'rejected',
          status: 'rejected',
          rejected_at: today,
          rejected_by: OWNER,
          rejected_reason: answer.reason,
        });
      }

      return { ...record };
    },
  };
}
