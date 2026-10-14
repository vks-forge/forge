/**
 * GitHub connection schema — one GitHub App in one org or personal account.
 *
 * Why: a company can work across several GitHub accounts, and a manifest-created App is
 *   private to its owner, so each account needs its own App (d-0094). The connection row
 *   records which App that is (id, slug, the account it lives in) and the name its private
 *   key sits under in the SecretStore. The key is never a column and never part of this
 *   shape, so no API response or log built from a connection can leak it. Projects point at
 *   a connection and the GitHub host resolves the App id and key from it.
 *
 * Exports: GithubConnection, GithubConnectionStatus, GithubConnectionId.
 * Depends on: schemas/secret-name, zod. No IO.
 */

import { z } from 'zod';
import { SecretName } from '#/schemas/secret-name.js';

/** `active` connections can serve projects; `disabled` ones are kept but refuse new work. */
export const GithubConnectionStatus = z.enum(['active', 'disabled']);
export type GithubConnectionStatus = z.infer<typeof GithubConnectionStatus>;

/** Connection ids double as secret-name segments (`github/<id>/key`), so they are lowercase slugs. */
export const GithubConnectionId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
export type GithubConnectionId = z.infer<typeof GithubConnectionId>;

export const GithubConnection = z.object({
  id: GithubConnectionId,
  /** The GitHub account or organisation the App belongs to. */
  account: z.string().min(1),
  app_id: z.string().regex(/^[0-9]+$/),
  app_slug: z.string().min(1).optional(),
  /** Where the App's private key lives in the SecretStore; the key itself is never stored here. */
  key_secret_name: SecretName,
  status: GithubConnectionStatus,
  created_at: z.iso.datetime(),
});
export type GithubConnection = z.infer<typeof GithubConnection>;
