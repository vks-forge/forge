/**
 * Schema of the structured payload of a Worker's `finish` event.
 *
 * Why: the claims a Worker makes in `finish` are what gate G1 checks against the receipts
 *   and the real diff. They arrive as stored run-event JSON, which is untrusted until
 *   parsed; a malformed list must stop verification (fail closed) rather than be read as
 *   "no claims" and pass a run that said nothing checkable.
 *
 * Exports: FinishClaims.
 * Depends on: zod, @forge/core (Claim). No IO.
 */

import { Claim } from '@forge/core';
import { z } from 'zod';

export const FinishClaims = z.object({ claims: z.array(Claim) });
export type FinishClaims = z.infer<typeof FinishClaims>;
