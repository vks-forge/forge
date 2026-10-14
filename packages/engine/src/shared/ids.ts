/**
 * Id and token generation for the engine.
 *
 * Why: the engine does no crypto of its own (it takes an `IdSource`), and a run token is a
 *   bearer credential: it must come from the OS random source, be long enough to be
 *   unguessable and be safe to put in a URL path or header. Run, wake and interaction ids
 *   are random too, so two server instances sharing a database can never collide.
 *
 * Exports: createIdSource(), createOwnerId().
 * Depends on: node:crypto, types/engine (IdSource). IO: reads the OS random source.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import type { IdSource } from '#/types/engine.types.js';

const short = (): string => randomUUID().replaceAll('-', '').slice(0, 20);

/** Real id source: random ids and 256-bit base64url run tokens. */
export function createIdSource(): IdSource {
  return {
    runId: () => `run-${short()}`,
    wakeId: () => `wake-${short()}`,
    interactionId: () => `int-${short()}`,
    token: () => randomBytes(32).toString('base64url'),
  };
}

/** A fresh owner id for one server start (d-0054: a new start owns no earlier run). */
export function createOwnerId(): string {
  return `srv-${short()}`;
}
