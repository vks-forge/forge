/**
 * GitHub connections API: list and add the Apps a company reaches its repositories through.
 *
 * Why: a manifest-created App belongs to one org or account, so a company with repos in
 *   several needs several connections (d-0094). Until the manifest flow exists the user
 *   enters an existing App's id and private key (d-0084 fallback). The key is the one
 *   secret here: it goes straight into the SecretStore under `github/<id>/key` and is
 *   never written to the database, logged or echoed in any response; the row only holds
 *   the secret's name. If the row cannot be saved after the key was stored, the key is
 *   removed again so no orphan secret is left behind.
 *
 * Exports: githubConnectionRoutes().
 * Depends on: @forge/core, schemas/api, services/http/*, types/routes. IO: storage, SecretStore.
 */

import type { GithubConnection } from '@forge/core';
import { ConnectionCreateBody } from '#/schemas/api.js';
import { readJson } from '#/services/http/body.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** A connection id from the account name: lowercase letters, digits and dashes, at most 40. */
function slugOf(account: string): string {
  const slug = account
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)
    .replace(/-+$/g, '');

  return slug === '' ? 'github' : slug;
}

/** `base`, or `base-2`, `base-3`, ... when that id is taken. */
function freeId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }

  let n = 2;
  while (taken.has(`${base}-${n}`)) {
    n++;
  }

  return `${base}-${n}`;
}

export function githubConnectionRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'GET',
      path: '/github/connections',
      async handle({ res }) {
        const connections = await deps.storage.transaction((tx) =>
          tx.githubConnections.list(),
        );

        sendJson(res, 200, { connections });
      },
    },
    {
      method: 'POST',
      path: '/github/connections',
      async handle({ req, res }) {
        const body = await readJson(req, ConnectionCreateBody);
        const { private_key_pem: pem, ...fields } = body;

        const taken = new Set(
          (await deps.storage.transaction((tx) => tx.githubConnections.list())).map(
            (c) => c.id,
          ),
        );

        const id = freeId(slugOf(body.account), taken);
        const connection: GithubConnection = {
          id,
          account: fields.account,
          app_id: fields.app_id,
          ...(fields.app_slug ? { app_slug: fields.app_slug } : {}),
          key_secret_name: `github/${id}/key`,
          status: 'active',
          created_at: new Date(deps.now()).toISOString(),
        };

        await deps.secrets.put(connection.key_secret_name, new TextEncoder().encode(pem));
        try {
          await deps.storage.transaction((tx) => tx.githubConnections.upsert(connection));
        } catch (error) {
          await deps.secrets.delete(connection.key_secret_name).catch(() => undefined);
          throw error;
        }

        sendJson(res, 201, { connection });
      },
    },
  ];
}
