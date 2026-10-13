/**
 * Schemas of the GitHub REST responses the App host reads.
 *
 * Why: GitHub's replies are untrusted input at the network boundary. Anything the host
 *   acts on (a PR's state, head sha and mergeability, the merge commit, the installation
 *   token and its expiry) is parsed here first, so a changed or hostile response fails as
 *   an `unavailable` error instead of being read as, say, a mergeable PR.
 *
 * Exports: PullResponse, MergeResponse, TokenResponse.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** A pull request as `GET /pulls/{n}` and the list endpoint return it. */
export const PullResponse = z.object({
  number: z.number().int().positive(),
  html_url: z.string().min(1),
  state: z.enum(['open', 'closed']),
  merged: z.boolean().optional(),
  mergeable: z.boolean().nullable().optional(),
  head: z.object({ sha: z.string().min(1) }),
});
export type PullResponse = z.infer<typeof PullResponse>;

/** The answer of `PUT /pulls/{n}/merge`. */
export const MergeResponse = z.object({ sha: z.string().min(1) });
export type MergeResponse = z.infer<typeof MergeResponse>;

/** The answer of `POST /app/installations/{id}/access_tokens`. */
export const TokenResponse = z.object({
  token: z.string().min(1),
  expires_at: z.iso.datetime(),
});
export type TokenResponse = z.infer<typeof TokenResponse>;
