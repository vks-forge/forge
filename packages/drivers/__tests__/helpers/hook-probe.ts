/**
 * Fixture builder for probe 2: per-scenario settings file, hook script and log.
 *
 * Why: The Factory trusts hooks as the chokepoint for every Worker tool call, so we must know exactly when a hook blocks and when a broken one silently lets the call through. Each scenario gets its own directory so one run's log can never satisfy another run's assertion (d-0033).
 *
 * Exports: HookScenario, makeHookScenario().
 * Depends on: helpers/probe-env, node:fs, node:path. IO: writes files under
 *   .forge/data/probes/2/<scenario>/.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshProbeDir, slashPath } from './probe-env.js';

/** Hook body: log the event name, and block (exit 2) every PreToolUse call. */
const HOOK_SOURCE = `const fs = require('node:fs');
const path = require('node:path');
let ev = {};
try { ev = JSON.parse(fs.readFileSync(0, 'utf8')); } catch {}
const name = ev.hook_event_name || 'unknown';
fs.appendFileSync(path.join(__dirname, 'log.txt'), name + ' tool=' + (ev.tool_name || '-') + '\\n');
if (name === 'PreToolUse') { process.stderr.write('blocked by probe hook'); process.exit(2); }
`;

export interface HookScenario {
  /** Directory holding settings.json, hook.cjs and log.txt. */
  dir: string;
  settingsPath: string;
  /** Lines the hook appended to log.txt (empty when it never ran). */
  readLog(): string[];
}

/**
 * Writes a scenario. `hookTarget` picks the script the hook command runs ('real' or a
 * missing file); `onFailure` is included in each hook only when given.
 */
export function makeHookScenario(
  name: string,
  opts: { hookTarget: 'real' | 'missing'; onFailure?: 'block' },
): HookScenario {
  const dir = freshProbeDir('2', name);
  const real = join(dir, 'hook.cjs');
  writeFileSync(real, HOOK_SOURCE);
  const script = opts.hookTarget === 'real' ? real : join(dir, 'does-not-exist.cjs');
  const hook = {
    type: 'command',
    command: `node ${slashPath(script)}`,
    timeout: 10,
    ...(opts.onFailure ? { onFailure: opts.onFailure } : {}),
  };
  const settings = {
    hooks: {
      SessionStart: [{ hooks: [hook] }],
      PreToolUse: [{ matcher: '.*', hooks: [hook] }],
    },
  };
  const settingsPath = join(dir, 'settings.json');
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  const logPath = join(dir, 'log.txt');
  return {
    dir,
    settingsPath,
    readLog: () =>
      existsSync(logPath)
        ? readFileSync(logPath, 'utf8').split('\n').filter(Boolean)
        : [],
  };
}
