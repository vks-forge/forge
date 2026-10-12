#!/usr/bin/env node
/**
 * Hook entry point the harness executes: `node <abs path>/bin/hook.js`.
 *
 * Why: the harness runs this file as a plain child process, so it cannot use the
 *   TypeScript sources or the `development` import condition. It loads the compiled
 *   client from `dist/` (run `pnpm build` before a live run). If the build is missing
 *   or broken the harness would see node's own exit code 1, which Claude Code treats
 *   as a non-blocking error, so the load is wrapped to exit 2 instead (fail closed).
 *
 * Exports: none (script).
 * Depends on: ../dist/client/hook-main.js.
 */

let code = 2;
try {
  const { main } = await import('../dist/client/hook-main.js');
  code = await main();
} catch (error) {
  const why = error instanceof Error ? error.message : 'unknown';
  process.stderr.write(
    `forge-hook: fail-closed: cannot load hook (${why.split('\n')[0]}). Run pnpm build.\n`,
  );
}
process.exit(code);
