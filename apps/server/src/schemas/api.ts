/**
 * Request bodies and query parameters of the HTTP API.
 *
 * Why: every byte that arrives over HTTP is untrusted until a schema has parsed it
 *   (code.md rule 4). Keeping the shapes in one file gives the routes and their tests the
 *   same definition, and a malformed request becomes a 400 with the issues listed instead
 *   of a half-valid object reaching the engine. The intake body is the core `IntakeEvent`
 *   itself, so a second hand-written shape cannot drift from it.
 *
 * Exports: AnswerBody, LastEventId.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** `POST /interactions/:id/answer`; `answer` may be any JSON value except absent. */
export const AnswerBody = z
  .object({ answer: z.unknown() })
  .refine((body) => body.answer !== undefined, {
    message: 'answer is required',
    path: ['answer'],
  });
export type AnswerBody = z.infer<typeof AnswerBody>;

/** A non-negative integer sequence number, as sent in `Last-Event-ID` or `?after=`. */
export const LastEventId = z.coerce.number().int().nonnegative();
