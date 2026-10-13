/**
 * Tiny JSON helpers for the fake HTTP servers in the git tests.
 *
 * Why: the fake GitHub server reads request bodies and answers with JSON in dozens of
 *   places; keeping those two moves here leaves the server file about GitHub's rules.
 *
 * Exports: readBody(), send().
 * Depends on: node:http. No IO beyond the given request and response.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export const readBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const c of req) {
    chunks.push(c as Buffer);
  }

  const text = Buffer.concat(chunks).toString('utf8');

  return text.length > 0 ? JSON.parse(text) : undefined;
};

export const send = (
  res: ServerResponse,
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): void => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};
