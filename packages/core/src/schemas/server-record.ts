/**
 * Server record schema — `server.json` in the data home, written by the running server.
 *
 * Why: `forge start`, `forge status` and `forge stop` run in a different process from the
 *   server and must find it without scanning ports: which process, which port, since when,
 *   which build. The server writes this file once it is listening and removes it on a clean
 *   exit; the CLI parses it strictly, so a truncated or hand-edited file reads as "no
 *   usable record" instead of sending an install token to a wrong port.
 *
 * Exports: ServerRecord.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

export const ServerRecord = z.strictObject({
  pid: z.number().int().positive(),
  port: z.number().int().min(1).max(65535),
  /** ISO timestamp the server began listening. */
  startedAt: z.iso.datetime(),
  version: z.string().min(1),
});
export type ServerRecord = z.infer<typeof ServerRecord>;
