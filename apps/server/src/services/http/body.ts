/**
 * Reading and validating a JSON request body.
 *
 * Why: the body is the first untrusted input the server sees. It is size-capped while it
 *   streams (a client that lies about, or omits, `Content-Length` still cannot buffer more
 *   than the limit), must declare `application/json`, must parse, and must pass a zod
 *   schema before any handler uses it. Each failure has its own status: 413 too large,
 *   415 wrong media type, 400 bad JSON or failed validation with the issues listed.
 *
 * Exports: DEFAULT_BODY_LIMIT, readBody(), readJsonValue(), readJson().
 * Depends on: node:http, zod, services/http/http-errors. IO: reads the request stream.
 */

import type { IncomingMessage } from 'node:http';
import type { ZodType } from 'zod';
import { HttpError } from '#/services/http/http-errors.js';

/** 1 MiB: far above any intake or answer, far below anything that could hurt the process. */
export const DEFAULT_BODY_LIMIT = 1024 * 1024;

function assertJsonType(req: IncomingMessage): void {
  const type = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/json') {
    throw new HttpError(
      415,
      'unsupported_media_type',
      'content-type must be application/json',
    );
  }
}

/** The raw body as text; throws 413 as soon as the limit is crossed. */
export async function readBody(
  req: IncomingMessage,
  limit: number = DEFAULT_BODY_LIMIT,
): Promise<string> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    throw new HttpError(413, 'payload_too_large', `body exceeds ${limit} bytes`);
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.from(chunk as Uint8Array);
    size += part.length;
    if (size > limit) {
      throw new HttpError(413, 'payload_too_large', `body exceeds ${limit} bytes`);
    }

    chunks.push(part);
  }

  return Buffer.concat(chunks).toString('utf8');
}

/** Parses the body as JSON without validating its shape (the hook route does its own). */
export async function readJsonValue(
  req: IncomingMessage,
  limit: number = DEFAULT_BODY_LIMIT,
): Promise<unknown> {
  assertJsonType(req);
  const text = await readBody(req, limit);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json', 'body is not valid JSON');
  }
}

/** Reads, parses and validates the body; throws HttpError 413, 415 or 400. */
export async function readJson<T>(
  req: IncomingMessage,
  schema: ZodType<T>,
  limit: number = DEFAULT_BODY_LIMIT,
): Promise<T> {
  const value = await readJsonValue(req, limit);
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw HttpError.fromZod(parsed.error);
  }

  return parsed.data;
}
