/**
 * `requestJson()`: one typed, validated call to the Forge server.
 *
 * Why: every http-adapter method needs the same three guarantees. A call that cannot connect
 *   must become a `network` error, not a raw TypeError. A refusal must carry the server's own
 *   error code and message (`{ error: { code, message } }`). A success body is parsed with a
 *   zod schema before any component sees it, so a server and UI that disagree fail here with
 *   the offending field named. The page sends no credentials: the dev proxy (or the hand-off
 *   built in W7) adds them, so the token never passes through this code.
 *
 * Exports: requestJson().
 * Depends on: api/api-error, schemas/http, types/api.types, zod.
 */

import type { z } from 'zod';
import { ApiError } from '#/api/api-error.js';
import { ErrorBody } from '#/schemas/http.js';
import type { HttpClientOptions, JsonRequest } from '#/types/api.types.js';

async function send(
  client: HttpClientOptions,
  path: string,
  request: JsonRequest,
): Promise<Response> {
  const doFetch = client.fetch ?? globalThis.fetch.bind(globalThis);
  const hasBody = request.body !== undefined;

  try {
    return await doFetch(`${client.baseUrl}${path}`, {
      method: request.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new ApiError('network', 'Cannot reach the Forge server.', { cause: error });
  }
}

async function refusal(response: Response): Promise<ApiError> {
  const raw: unknown = await response.json().catch(() => null);
  const parsed = ErrorBody.safeParse(raw);
  const { code, message } = parsed.success
    ? parsed.data.error
    : { code: 'http_error', message: `The Forge server answered ${response.status}.` };

  return new ApiError('http', message, { status: response.status, code, body: raw });
}

/** Calls `path` under the client's base URL and returns the body parsed by `schema`. */
export async function requestJson<S extends z.ZodType>(
  client: HttpClientOptions,
  path: string,
  schema: S,
  request: JsonRequest = {},
): Promise<z.infer<S>> {
  const response = await send(client, path, request);
  if (!response.ok) {
    throw await refusal(response);
  }

  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join('.') || 'body';

    throw new ApiError(
      'payload',
      `The Forge server sent an unexpected answer (${where}).`,
      {
        status: response.status,
        cause: parsed.error,
      },
    );
  }

  return parsed.data;
}
