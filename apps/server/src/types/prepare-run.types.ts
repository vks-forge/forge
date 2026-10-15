/**
 * Options of the run preparation port.
 *
 * Why: preparing a run needs paths (run directory, database, MCP entry), the credential
 *   registry, the receipt log (a resumed run's first act is the `resumed` link in its chain,
 *   d-0100), a clock and the server's own URL. Naming them as one bag keeps the function
 *   small and lets a test point it at a temp directory and a fake port.
 *
 * Exports: PrepareRunOptions.
 * Depends on: @forge/hooks (RunSecretRegistry), @forge/tools (ReceiptLog). Types only.
 */

import type { RunSecretRegistry } from '@forge/hooks';
import type { ReceiptLog } from '@forge/tools';

export interface PrepareRunOptions {
  /** `<dataHome>/runs`; each run gets a subdirectory. */
  readonly runsDir: string;
  /** Absolute path of the SQLite file the per-run MCP process opens. */
  readonly dbPath: string;
  /** Absolute path of `apps/mcp/dist/main.js`. */
  readonly mcpEntry: string;
  /** Node executable that runs the MCP entry. */
  readonly nodePath: string;
  readonly registry: RunSecretRegistry;
  /** The chain the hook route writes; a resume appends its `resumed` link here. */
  readonly receipts: ReceiptLog;
  /** Epoch ms; defaults to the system clock. */
  readonly now?: () => number;
  /** Base URL of this server, e.g. `http://127.0.0.1:4310`; read per run because the port may be dynamic. */
  readonly hookBaseUrl: () => string;
  /**
   * Runs first, before anything is created for the run; a throw refuses the start (the
   * installed harness build is not the one whose approvals were loaded) and is recorded
   * by the engine as the run's failure.
   */
  readonly checkBuild?: (runId: string) => Promise<void>;
}
