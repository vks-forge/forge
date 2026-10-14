/**
 * Request bodies and query parameters of the HTTP API.
 *
 * Why: every byte that arrives over HTTP is untrusted until a schema has parsed it
 *   (code.md rule 4). Keeping the shapes in one file gives the routes and their tests the
 *   same definition, and a malformed request becomes a 400 with the issues listed instead
 *   of a half-valid object reaching the engine. The intake body is the core `IntakeEvent`
 *   itself, so a second hand-written shape cannot drift from it.
 *
 * Exports: AnswerBody, LastEventId, SettingsPutBody, HarnessPutBody, HarnessSecretBody, LiveQuery.
 * Depends on: @forge/core (HarnessAuthMode, HarnessKind, HarnessSecretKind), zod. No IO.
 */

import { HarnessAuthMode, HarnessKind, HarnessSecretKind } from '@forge/core';
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

/**
 * `PUT /settings/company` and `PUT /settings/projects/:slug`. `doc` is only checked to be an
 * object here; the scope's override schema (strict, deep-partial) judges its keys. The
 * scope and project come from the path, never the body, so a body cannot aim a save at
 * another scope.
 */
export const SettingsPutBody = z
  .object({
    doc: z.record(z.string(), z.unknown()),
    author: z.string().min(1),
    reason: z.string().min(1),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export type SettingsPutBody = z.infer<typeof SettingsPutBody>;

/** `PUT /harnesses/:id`: where the executable is (PATH when absent) and how it authenticates. */
export const HarnessPutBody = z
  .object({
    kind: HarnessKind,
    binary_path: z.string().min(1).max(1024).optional(),
    auth_mode: HarnessAuthMode,
  })
  .strict();
export type HarnessPutBody = z.infer<typeof HarnessPutBody>;

/**
 * `PUT /harnesses/:id/secret`: a pasted API key or OAuth token. One token, no whitespace;
 * the cap keeps a wrong paste (a file, a page) from reaching the SecretStore.
 */
export const HarnessSecretBody = z
  .object({
    kind: HarnessSecretKind,
    value: z
      .string()
      .min(1)
      .max(4096)
      .regex(/^\S+$/, 'must be a single token without spaces'),
  })
  .strict();
export type HarnessSecretBody = z.infer<typeof HarnessSecretBody>;

/** `?live=1` on the test route turns the paid hello call on; anything else leaves it off. */
export const LiveQuery = z.enum(['1', 'true']);
