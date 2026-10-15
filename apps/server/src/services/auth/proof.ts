/**
 * Proof that this server knows the install token, without sending the token.
 *
 * Why: the CLI reads the install token from disk and sends it to the port recorded in
 *   `server.json`. If that Forge died and another program took the port, the token would go
 *   to an impostor. So before sending it the CLI sends a random nonce, and the server answers
 *   `HMAC-SHA256(token, nonce)`: only a holder of the token can produce it, the token is never
 *   on the wire, and a fresh nonce each time makes a recorded answer useless.
 *
 * Exports: createTokenProver().
 * Depends on: node:crypto, types/auth. No IO.
 */

import { createHmac } from 'node:crypto';
import type { TokenProver } from '#/types/auth.types.js';

/** A prover keyed by the install token. */
export function createTokenProver(token: string): TokenProver {
  return {
    prove: (nonce) => createHmac('sha256', token).update(nonce).digest('hex'),
  };
}
