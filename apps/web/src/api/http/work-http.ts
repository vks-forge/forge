/**
 * The `http` side of the work resources: stats, cost, inbox and runs.
 *
 * Why: Home, Inbox, Runs and Cost answer "what is happening and what did it cost?" and must
 *   show exactly what the server computed. This is the only place that knows those paths and
 *   how a slug, an item id (`<kind>:<source id>`, which holds colons and slashes) or a repeated
 *   `status` is written into a URL; every answer is parsed with the schema core owns, so a
 *   field the server renames fails here with its name instead of rendering as a blank or a 0.
 *
 * Exports: createWorkHttp().
 * Depends on: @forge/core (schemas), api/http/request-json, types/api.types.
 */

import {
  CostReport,
  InboxCounts,
  InboxItem,
  InboxPage,
  ProjectStats,
  RunDetail,
  RunListPage,
} from '@forge/core';
import { requestJson } from '#/api/http/request-json.js';
import type { HttpClientOptions, HttpOnlyApis } from '#/types/api.types.js';
import type { QueryParams } from '#/types/work-api.types.js';

const enc = encodeURIComponent;

/** `?a=1&b=2`, skipping undefined values; repeated keys come from array values. */
function query(params: QueryParams): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    for (const one of typeof value === 'object' ? value : [value]) {
      search.append(key, String(one));
    }
  }

  const text = search.toString();

  return text === '' ? '' : `?${text}`;
}

export function createWorkHttp(client: HttpClientOptions): HttpOnlyApis {
  const project = (slug: string, rest: string): string => `/projects/${enc(slug)}${rest}`;

  return {
    stats: {
      get: (slug, range, options) =>
        requestJson(
          client,
          project(slug, `/stats${query({ range })}`),
          ProjectStats,
          options,
        ),
    },
    cost: {
      get: (slug, range, options) =>
        requestJson(
          client,
          project(slug, `/cost${query({ range })}`),
          CostReport,
          options,
        ),
    },
    inbox: {
      list: (slug, args, options) =>
        requestJson(
          client,
          project(
            slug,
            `/inbox${query({ view: args.view, cursor: args.cursor, limit: args.limit })}`,
          ),
          InboxPage,
          options,
        ),
      counts: (slug, options) =>
        requestJson(client, project(slug, '/inbox/counts'), InboxCounts, options),
      mark: (slug, itemId, mark) =>
        requestJson(client, project(slug, `/inbox/${enc(itemId)}/${mark}`), InboxItem, {
          method: 'POST',
        }),
    },
    runs: {
      list: (slug, args, options) =>
        requestJson(
          client,
          project(
            slug,
            `/runs${query({ status: args.status, cursor: args.cursor, limit: args.limit })}`,
          ),
          RunListPage,
          options,
        ),
      get: (id, options) => requestJson(client, `/runs/${enc(id)}`, RunDetail, options),
    },
  };
}
