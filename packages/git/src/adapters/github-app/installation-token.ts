/**
 * Installation-token source: mints a GitHub App installation token and caches it.
 *
 * Why: every push and REST call needs a bearer token that GitHub issues for one hour in
 *   exchange for a signed App JWT. Minting per call would hit the API and the key store
 *   on every operation; caching until five minutes before `expires_at` keeps the key
 *   read rare while never handing out a token about to expire mid-push. Concurrent
 *   callers share one in-flight mint so a burst of operations makes one request.
 *
 * Exports: createTokenSource().
 * Depends on: zod, adapters/github-app/{app-jwt,rest-client}, shared/host-errors.
 *   IO: key read and one POST per refresh.
 */

import { z } from 'zod';
import { createAppJwt } from '#/adapters/github-app/app-jwt.js';
import type { TokenSource, TokenSourceOptions } from '#/types/github-rest.types.js';
import { GitHostError } from '#/shared/host-errors.js';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const TokenResponse = z.object({
  token: z.string().min(1),
  expires_at: z.iso.datetime(),
});

export function createTokenSource(o: TokenSourceOptions): TokenSource {
  let cached: { token: string; refreshAt: number } | null = null;
  let inflight: Promise<string> | null = null;

  const mint = async (): Promise<string> => {
    const jwt = createAppJwt(o.appId, await o.privateKey(), o.now());
    const { json } = await o.rest.call(
      jwt,
      'POST',
      `/app/installations/${encodeURIComponent(o.installationId)}/access_tokens`,
      { accept: [201] },
    );

    const parsed = TokenResponse.safeParse(json);
    if (!parsed.success) {
      throw new GitHostError(
        'unavailable',
        'GitHub returned an unreadable installation token response',
      );
    }

    cached = {
      token: parsed.data.token,
      refreshAt: Date.parse(parsed.data.expires_at) - REFRESH_MARGIN_MS,
    };

    return parsed.data.token;
  };

  return {
    async token() {
      if (cached !== null && o.now() < cached.refreshAt) {
        return cached.token;
      }

      inflight ??= mint().finally(() => {
        inflight = null;
      });

      return inflight;
    },
  };
}
