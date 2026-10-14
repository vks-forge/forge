/**
 * Names of a harness's credentials in the SecretStore.
 *
 * Why: the server stores a pasted API key or OAuth token and the driver reads it back at
 *   the start of each run. Both sides must agree on the name, and a harness id must never
 *   build a name that climbs out of the `harness/` namespace, so the name is made in one
 *   place from a validated id (d-0087).
 *
 * Exports: harnessSecretName().
 * Depends on: schemas/harness, shared/errors. No IO.
 */

import { HarnessId } from '#/schemas/harness.js';
import type { HarnessSecretKind } from '#/schemas/harness.js';
import { InvalidInputError } from '#/shared/errors.js';

const SUFFIX: Record<HarnessSecretKind, string> = {
  api_key: 'api-key',
  oauth_token: 'oauth-token',
};

/** `harness/<id>/api-key` or `harness/<id>/oauth-token`; throws InvalidInputError for a bad id. */
export function harnessSecretName(id: string, kind: HarnessSecretKind): string {
  if (!HarnessId.safeParse(id).success) {
    throw new InvalidInputError(`invalid harness id: ${JSON.stringify(id).slice(0, 60)}`);
  }

  return `harness/${id}/${SUFFIX[kind]}`;
}
