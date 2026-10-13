/**
 * Verifies the GitHub App JWT the way GitHub does, for the fake GitHub server.
 *
 * Why: the App host must send a correctly signed, short-lived RS256 JWT to mint an
 *   installation token. A host that signed with the wrong key, claimed another App id or
 *   asked for a lifetime over 10 minutes would work against a lax fake and fail against
 *   GitHub, so the fake enforces the same checks.
 *
 * Exports: appJwtValid().
 * Depends on: node:crypto. No IO.
 */

import { createVerify } from 'node:crypto';

/** True when `jwt` is signed by `publicKeyPem`, issued by `appId`, unexpired and valid for at most 10 minutes. */
export function appJwtValid(
  jwt: string,
  publicKeyPem: string,
  appId: string,
  nowMs: number,
): boolean {
  const [h, p, s] = jwt.split('.');
  if (!h || !p || !s) {
    return false;
  }

  const verify = createVerify('RSA-SHA256').update(`${h}.${p}`);
  if (!verify.verify(publicKeyPem, Buffer.from(s, 'base64url'))) {
    return false;
  }

  const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as {
    iss: string;
    iat: number;
    exp: number;
  };

  const nowSec = nowMs / 1000;

  return claims.iss === appId && claims.exp > nowSec && claims.exp - claims.iat <= 600;
}
