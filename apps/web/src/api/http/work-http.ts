/**
 * The `http` side of the work resources: cost, inbox and runs (including steering a run).
 *
 * Why: Home, Inbox, Runs and Cost answer "what is happening and what did it cost?" and must
 *   show exactly what the server computed. This is the only place that knows those paths and
 *   how a slug, an item id (`<kind>:<source id>`, which holds colons and slashes) or a repeated
 *   `status` is written into a URL; every answer is parsed with the schema core owns, so a
 *   field the server renames fails here with its name instead of rendering as a blank or a 0.
 *
 * Exports: createWorkHttp().
 * Depends on: @forge/core (schemas), api/http/request-json, schemas/tickets (SteerReply),
 *   types/api.types.
 */

import {
  CostReport,
  InboxCounts,
  InboxItem,
  InboxPage,
  InboxReadAllResult,
  OverviewStats,
  RunDetail,
  RunListPage,
  RunSourcesReply,
} from '@forge/core';
import { requestJson } from '#/api/http/request-json.js';
import { SteerReply } from '#/schemas/tickets.js';
import type { HttpClientOptions, ResourceApis } from '#/types/api.types.js';
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

export function createWorkHttp(
  client: HttpClientOptions,
): Pick<ResourceApis, 'overview' | 'cost' | 'inbox' | 'runs'> {
  const project = (slug: string, rest: string): string => `/projects/${enc(slug)}${rest}`;

  return {
    overview: {
      get: (request, options) =>
        requestJson(
          client,
          `/stats/overview${query({
            range: request.range,
            group: request.group,
            projects:
              request.projects.length === 0 ? undefined : request.projects.join(','),
            archived: request.archived ? 1 : 0,
          })}`,
          OverviewStats,
          options,
        ),
    },
    cost: {
      get: (slug, range, options, page) =>
        requestJson(
          client,
          project(
            slug,
            `/cost${query({
              range,
              ticket_limit: page?.ticket.limit,
              ticket_offset: page?.ticket.offset,
              run_limit: page?.run.limit,
              run_offset: page?.run.offset,
            })}`,
          ),
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
      markAllRead: (slug, view) =>
        requestJson(client, project(slug, '/inbox/read-all'), InboxReadAllResult, {
          method: 'POST',
          body: { view },
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
      sources: (id, options) =>
        requestJson(client, `/runs/${enc(id)}/sources`, RunSourcesReply, options),
      steer: (id, message, author) =>
        requestJson(client, `/runs/${enc(id)}/steer`, SteerReply, {
          method: 'POST',
          body: { message, author },
        }),
    },
  };
}
