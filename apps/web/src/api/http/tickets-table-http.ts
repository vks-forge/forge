/**
 * The `http` side of the Tickets table: the paged, filtered, sorted ticket list.
 *
 * Why: the Tickets screen needs filters, sorting and a total that the Board's cursor list
 *   does not give. This is the only module that knows how the table state is written into
 *   the query (`state`, `lane`, `q`, `sort` (`updated`, `created` or `cost`), `limit`, `offset`) and the answer
 *   is parsed with the table schema, so if the server's contract differs only this file
 *   changes.
 *
 * Exports: createTicketsTableHttp().
 * Depends on: api/http/request-json, schemas/tickets-table, types/api.types.
 */

import { requestJson } from '#/api/http/request-json.js';
import { TicketsTablePage } from '#/schemas/tickets-table.js';
import type { HttpClientOptions } from '#/types/api.types.js';
import type { TicketsTableApi } from '#/types/tickets-table.types.js';

export function createTicketsTableHttp(client: HttpClientOptions): TicketsTableApi {
  return {
    list: (slug, params, options) => {
      const search = new URLSearchParams();

      if (params.states.length > 0) {
        search.set('state', params.states.join(','));
      }

      if (params.lane) {
        search.set('lane', params.lane);
      }

      if (params.q !== '') {
        search.set('q', params.q);
      }

      search.set('sort', params.sort);
      search.set('limit', String(params.size));
      search.set('offset', String((params.page - 1) * params.size));

      return requestJson(
        client,
        `/projects/${encodeURIComponent(slug)}/tickets?${search.toString()}`,
        TicketsTablePage,
        options,
      );
    },
  };
}
