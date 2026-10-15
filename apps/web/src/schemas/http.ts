/**
 * Schemas for the envelopes every Forge server response shares: errors and SSE tickets.
 *
 * Why: the page must turn a failed call into a sentence the user can act on ("the server
 *   rejected the credentials") instead of "Unexpected token". The error body
 *   (`{ error: { code, message } }`) and the SSE ticket reply (`{ ticket, expires_in_s }`)
 *   mirror apps/server `services/http/http-errors.ts` and `routes/auth.ts`; `@forge/core`
 *   does not export them because they are HTTP concerns of the server app.
 *
 * Exports: ErrorBody, SseTicketReply (schemas and inferred types).
 * Depends on: zod.
 */

import { z } from 'zod';

export const ErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const SseTicketReply = z.object({
  ticket: z.string().min(1),
  expires_in_s: z.number().int().positive(),
});
export type SseTicketReply = z.infer<typeof SseTicketReply>;
