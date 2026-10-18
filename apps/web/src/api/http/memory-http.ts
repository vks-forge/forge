/**
 * The `memory` resource served by the real Forge server.
 *
 * Why: the owner reads, searches and exports a project's memory and answers the Director's
 *   proposals through `/projects/:slug/memory*`. An answer is signed with the owner's name so
 *   the record and its history say who decided. Slugs, ids and search words go into the path
 *   or query, so they are encoded: a hand-edited URL cannot reach another route. There is no
 *   call that edits or deletes a record, because the server has none.
 *
 * Exports: createMemoryHttp(), searchQuery().
 * Depends on: api/http/request-json, schemas/memory, domain/owner, types/*.
 */

import { requestJson } from '#/api/http/request-json.js';
import { OWNER } from '#/domain/owner.js';
import {
  MemoryAnswerResponse,
  MemoryExportReply,
  MemoryHistoryResponse,
  MemoryImportStatus,
  MemoryListResponse,
  MemoryRecordResponse,
  MemoryRelatedResponse,
  MemorySearchReply,
} from '#/schemas/memory.js';
import type { HttpClientOptions } from '#/types/api.types.js';
import type { MemoryApi, MemorySearchParams } from '#/types/memory.types.js';

/** The query string of one search: repeated keys for kind, status and tag. */
export function searchQuery(params: MemorySearchParams): string {
  const query = new URLSearchParams({ q: params.q.trim() });
  for (const kind of params.kinds) {
    query.append('kind', kind);
  }

  for (const status of params.statuses) {
    query.append('status', status);
  }

  for (const tag of params.tags) {
    query.append('tag', tag);
  }

  if (params.superseded) {
    query.set('superseded', '1');
  }

  query.set('k', String(params.limit));
  query.set('offset', String(params.offset));

  return query.toString();
}

export function createMemoryHttp(client: HttpClientOptions): MemoryApi {
  const base = (slug: string): string => `/projects/${encodeURIComponent(slug)}/memory`;
  const record = (slug: string, id: string): string =>
    `${base(slug)}/${encodeURIComponent(id)}`;

  return {
    async list(slug, options) {
      const body = await requestJson(client, base(slug), MemoryListResponse, options);

      return body.records;
    },

    async get(slug, id, options) {
      const body = await requestJson(
        client,
        record(slug, id),
        MemoryRecordResponse,
        options,
      );

      return body.record;
    },

    search: (slug, params, options) =>
      requestJson(
        client,
        `${base(slug)}/search?${searchQuery(params)}`,
        MemorySearchReply,
        options,
      ),

    history: (slug, id, options) =>
      requestJson(client, `${record(slug, id)}/history`, MemoryHistoryResponse, options),

    async related(slug, id, options) {
      const body = await requestJson(
        client,
        `${record(slug, id)}/related`,
        MemoryRelatedResponse,
        options,
      );

      return body.related;
    },

    importStatus: (slug, options) =>
      requestJson(client, `${base(slug)}/import`, MemoryImportStatus, options),

    retryImport: (slug) =>
      requestJson(client, `${base(slug)}/import`, MemoryImportStatus, {
        method: 'POST',
        body: {},
      }),

    exportMarkdown: (slug) =>
      requestJson(client, `${base(slug)}/export`, MemoryExportReply, {
        method: 'POST',
        body: {},
      }),

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
