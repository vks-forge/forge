/**
 * Stub routes for project memory: list, one record, and answering a proposal.
 *
 * Why: the approve and reject flows are optimistic and must roll back on failure, which only
 *   shows if the store really changes and can really refuse. These routes keep a copy of the
 *   sample records per call. Answering moves a pending proposal to a decision or a rejected
 *   record (the id is kept, like the real writer); answering twice is a 409, like the real
 *   route. Shapes match `apps/server/src/routes/memory.ts`.
 *
 * Exports: memoryRoutes().
 * Depends on: helpers/fetch-stub, helpers/forge-data/memory-data, domain/owner.
 */

import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import { memoryData } from '#tests/helpers/forge-data/memory-data.js';
import { OWNER } from '#/domain/owner.js';

export function memoryRoutes(options: { empty: boolean }): Routes {
  const records = memoryData();
  const find = (id: string) => records.find((r) => r.id === id);
  const missing = (id: string) =>
    refusal(404, 'memory_record_not_found', `no memory record ${id}`);

  const answer =
    (verdict: 'approve' | 'reject'): Routes[string] =>
    ({ params, body }) => {
      const record = find(params['id']!);
      if (!record) {
        return missing(params['id']!);
      }

      if (record.status !== 'pending') {
        return refusal(
          409,
          'not_a_pending_proposal',
          `${record.id} is not a pending proposal`,
        );
      }

      const today = new Date().toISOString().slice(0, 10);
      if (verdict === 'approve') {
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
          rejected_reason: (body as { reason: string }).reason,
        });
      }

      return json({ record: { ...record }, commit: 'a1b2c3d' });
    };

  return {
    'GET /projects/:slug/memory': () =>
      json({
        records: options.empty
          ? []
          : records.map(({ id, kind, status, statement, tags }) => ({
              id,
              kind,
              status,
              statement,
              tags,
            })),
      }),

    'GET /projects/:slug/memory/:id': ({ params }) => {
      const record = find(params['id']!);

      return record ? json({ record: { ...record } }) : missing(params['id']!);
    },

    'POST /projects/:slug/memory/proposals/:id/approve': answer('approve'),
    'POST /projects/:slug/memory/proposals/:id/reject': answer('reject'),
  };
}
