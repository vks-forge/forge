/**
 * The `memory` resource served by the real Forge server.
 *
 * Why: the owner reads a project's decisions and answers the Director's proposals through
 *   `/projects/:slug/memory*`. An answer is signed with the owner's name so the record and
 *   the git commit say who decided. Slugs and ids go into the path, so they are encoded:
 *   a hand-edited URL cannot reach another route.
 *
 * Exports: createMemoryHttp().
 * Depends on: api/http/request-json, schemas/memory, domain/owner, types/*.
 */

import { requestJson } from '#/api/http/request-json.js';
import { OWNER } from '#/domain/owner.js';
import {
  MemoryAnswerResponse,
  MemoryListResponse,
  MemoryRecordResponse,
} from '#/schemas/memory.js';
import type { HttpClientOptions } from '#/types/api.types.js';
import type { MemoryApi } from '#/types/memory.types.js';

export function createMemoryHttp(client: HttpClientOptions): MemoryApi {
  const base = (slug: string): string => `/projects/${encodeURIComponent(slug)}/memory`;

  return {
    async list(slug, options) {
      const body = await requestJson(client, base(slug), MemoryListResponse, options);

      return body.records;
    },

    async get(slug, id, options) {
      const body = await requestJson(
        client,
        `${base(slug)}/${encodeURIComponent(id)}`,
        MemoryRecordResponse,
        options,
      );

      return body.record;
    },

    async answer(slug, answer) {
      const path = `${base(slug)}/proposals/${encodeURIComponent(answer.id)}/${answer.verdict}`;
      const body = await requestJson(client, path, MemoryAnswerResponse, {
        method: 'POST',
        body:
          answer.verdict === 'reject'
            ? { author: OWNER, reason: answer.reason }
            : { author: OWNER },
      });

      return body.record;
    },
  };
}
