#!/usr/bin/env node
/**
 * Hook entry point the harness executes: `node <abs path>/bin/hook.js`.
 *
 * Why: the harness runs this file as a plain child process, so it cannot use the
 *   TypeScript sources or the `development` import condition. It loads the compiled
 *   client through the package's own `#/` alias, which plain node resolves to `dist/` (run `pnpm build` before a live run). If the build is missing
 *   or broken node would exit 1, which Claude Code treats as a non-blocking error, so
 *   the load is wrapped to exit 2 instead (fail closed; effective on PreToolUse, the
 *   only hard gate). On Windows the Worker's OS user can rewrite this file and
 *   `hook.json`, so the hook is attribution, not isolation: the Claude driver cross-checks
 *   tool ids against receipts (d-0056).
 *
 * Exports: none (script).
 * Depends on: #/adapters/claude/hooks/hook-main.js (package `imports`: ./dist/* under plain
 *   node, ./src/* under the `development` condition).
 */

let code = 2;
try {
  const { main } = await import('#/adapters/claude/hooks/hook-main.js');
  code = await main();
} catch (error) {
  const why = error instanceof Error ? error.message : 'unknown';
  process.stderr.write(
    `forge-hook: fail-closed: cannot load hook (${why.split('\n')[0]}). Run pnpm build.\n`,
  );
}
process.exit(code);
