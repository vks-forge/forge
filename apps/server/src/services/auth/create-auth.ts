/**
 * Builds the authentication parts of the server: the install token, the guard, the tickets.
 *
 * Why: the assembly must end up with exactly one answer to "who may call the API", built
 *   before the first socket opens. Reading (or creating) the token file, wiring the guard and
 *   the SSE ticket issuer together here keeps the composition root short and means a
 *   token-file failure stops the server at start instead of leaving an open API.
 *
 * Exports: createAuth().
 * Depends on: services/auth/{guard,install-token,restrict-file,sse-tickets}, @forge/engine
 *   (Logger type), types/auth. IO: the install token file.
 */

import type { Logger } from '@forge/engine';
import { createAuthGuard } from '#/services/auth/guard.js';
import { ensureInstallToken } from '#/services/auth/install-token.js';
import { nodeRestrictFile } from '#/services/auth/restrict-file.js';
import { createSseTicketIssuer } from '#/services/auth/sse-tickets.js';
import type { Auth, RestrictFile } from '#/types/auth.types.js';

/** Reads or creates the install token at `tokenPath` and builds the guard around it. */
export async function createAuth(options: {
  readonly tokenPath: string;
  readonly now: () => number;
  readonly log: Logger;
  readonly restrict?: RestrictFile | undefined;
}): Promise<Auth> {
  const token = await ensureInstallToken(options.tokenPath, {
    restrict: options.restrict ?? nodeRestrictFile(),
    log: options.log,
  });

  const tickets = createSseTicketIssuer(options.now);

  return { guard: createAuthGuard(token, tickets), tickets };
}
