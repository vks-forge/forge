/**
 * forge-server: entry of the Forge server process.
 *
 * Why: run `node apps/server/dist/main.js` from the repository root (after `pnpm build`);
 *   it loads `.forge/config/forge.yaml` and the project config, opens the database and
 *   listens on 127.0.0.1. All behaviour is in `services/`; this file only hands the real
 *   process to `runServer`.
 *
 * Exports: none (executable).
 * Depends on: services/run-server.
 */

import { runServer } from '#/services/run-server.js';

await runServer({
  env: process.env,
  cwd: process.cwd(),
  stderr: (text) => process.stderr.write(text),
  exit: (code) => process.exit(code),
  onSignal: (signal, handler) => process.once(signal, () => handler(signal)),
});
