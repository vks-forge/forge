/**
 * GitHub App JSON Web Token (RS256) signed with node:crypto.
 *
 * Why: a GitHub App proves who it is by signing a short-lived JWT with its private key;
 *   GitHub trades that for an installation token. Doing the signing with the standard
 *   library avoids a dependency (code.md rule 11) and keeps the key bytes in this one
 *   function: it is parsed, used and dropped, never stored on an object or logged. The
 *   `iat` is backdated 60 s for clock skew and `exp` stays under GitHub's 10-minute limit.
 *
 * Exports: createAppJwt().
 * Depends on: node:crypto, @forge/core (AuthError). No IO.
 */

import { createPrivateKey, createSign } from 'node:crypto';
import { AuthError } from '@forge/core';

const b64url = (data: string | Buffer): string => Buffer.from(data).toString('base64url');

/** Signs `{iat: now-60, exp: now+540, iss: appId}` with the PEM private key; `nowMs` is epoch milliseconds. */
export function createAppJwt(appId: string, pem: Uint8Array, nowMs: number): string {
  const nowSec = Math.floor(nowMs / 1000);
  const signingInput = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ iat: nowSec - 60, exp: nowSec + 540, iss: appId }),
  )}`;
  try {
    const key = createPrivateKey(Buffer.from(pem));
    const signature = createSign('RSA-SHA256').update(signingInput).sign(key);
    return `${signingInput}.${b64url(signature)}`;
  } catch {
    // The underlying message can quote key material; say only what the user can act on.
    throw new AuthError('the GitHub App private key could not be read as an RSA PEM key');
  }
}
