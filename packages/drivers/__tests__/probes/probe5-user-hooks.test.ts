/**
 * Probe 5: per-run hooks passed through `_meta` work on ACP, and what user-level settings
 * (hooks, default mode) reach an ACP session.
 *
 * Why: Forge enforces policy on Worker tool calls with a PreToolUse hook (d-0033) and with
 * its own permission handler (d-0049). If a per-run settings file given to the ACP adapter
 * were ignored, the hook gate would be silently absent; if the operator's own hooks or
 * default mode leak in, a Worker's behaviour depends on whoever's machine it runs on. This
 * measures both without ever modifying the user's real settings (d-0048 item 6).
 *
 * Pins: (a) a PreToolUse hook from `_meta.claudeCode.options.settings` runs and blocks a
 *   shell call (hook log line exists, block message reaches the tool result); (b) the initial
 *   mode before our set_mode is recorded against the user's `permissions.defaultMode`, and the
 *   user's hook event names are recorded (names only) in .forge/data/probes/5/observed.json.
 * Depends on: helpers/acp-probe, helpers/probe-env. IO: spawns the ACP adapter (billable,
 *   capped at $0.05 per session), writes under .forge/data/probes/5/, reads
 *   ~/.claude/settings.json read-only.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeOptionsMeta, promptTurn, withAcp } from '#tests/helpers/acp-probe.js';
import {
  freshProbeDir,
  freshTempCwd,
  PROBES_ENABLED,
  SKIP_REASON,
  slashPath,
} from '#tests/helpers/probe-env.js';

const probe = it.skipIf(!PROBES_ENABLED);

const HOOK_SOURCE = `const fs = require('node:fs');
const path = require('node:path');
let ev = {};
try { ev = JSON.parse(fs.readFileSync(0, 'utf8')); } catch {}
fs.appendFileSync(path.join(__dirname, 'log.txt'), (ev.hook_event_name || 'unknown') + ' tool=' + (ev.tool_name || '-') + '\\n');
process.stderr.write('blocked by probe hook');
process.exit(2);
`;

/** Names only: event names and the default mode; no commands, matchers or paths. */
function userSettingsSummary(): { hookEvents: string[]; defaultMode: string | null } {
  try {
    const s = JSON.parse(
      readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8'),
    ) as {
      hooks?: Record<string, unknown>;
      permissions?: { defaultMode?: string };
    };
    return {
      hookEvents: Object.keys(s.hooks ?? {}),
      defaultMode: s.permissions?.defaultMode ?? null,
    };
  } catch {
    return { hookEvents: [], defaultMode: null };
  }
}

describe('probe 5: hooks and user settings under ACP (d-0049)', () => {
  probe(
    `per-run PreToolUse hook via _meta settings blocks a shell call ${SKIP_REASON}`,
    async () => {
      const dir = freshProbeDir('5');
      const hookPath = join(dir, 'hook.cjs');
      const logPath = join(dir, 'log.txt');
      const settingsPath = join(dir, 'settings.json');
      writeFileSync(hookPath, HOOK_SOURCE);
      writeFileSync(
        settingsPath,
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                matcher: '.*',
                hooks: [
                  {
                    type: 'command',
                    command: `node ${slashPath(hookPath)}`,
                    timeout: 5,
                    onFailure: 'block',
                  },
                ],
              },
            ],
          },
        }),
      );
      const user = userSettingsSummary();

      await withAcp(async (h) => {
        const session = await h.ctx
          .buildSession({
            cwd: freshTempCwd(),
            mcpServers: [],
            _meta: claudeOptionsMeta(2, { settings: settingsPath }),
          })
          .start();
        const initialMode = session.modes?.currentModeId ?? null;
        await h.ctx.request('session/set_mode', {
          sessionId: session.sessionId,
          modeId: 'default',
        });
        const turn = await promptTurn(
          session,
          'use the shell tool to run the command: echo hi',
        );

        const log = existsSync(logPath)
          ? readFileSync(logPath, 'utf8').split('\n').filter(Boolean)
          : [];
        const blob = JSON.stringify(turn.updates);
        const observed = {
          userHookEvents: user.hookEvents,
          userDefaultMode: user.defaultMode,
          initialModeBeforeSetMode: initialMode,
          hookLog: log,
          permissionRequests: h.permissionRequests.length,
          toolCallUpdateStatuses: turn.updates
            .filter((u) => u['sessionUpdate'] === 'tool_call_update')
            .map((u) => u['status']),
          blockMessageSeen: blob.includes('blocked by probe hook'),
          stopReason: turn.stopReason,
          agentText: turn.text.slice(0, 400),
          userHookEffectObservable: false,
        };
        writeFileSync(join(dir, 'observed.json'), JSON.stringify(observed, null, 2));
        console.info('probe5 observed', JSON.stringify(observed));

        // (a) per-run hook via _meta settings.
        expect(log.some((l) => l.startsWith('PreToolUse'))).toBe(true);
        expect(blob).toContain('blocked by probe hook');
        // (b) d-0048 item 6: initial mode follows the user's defaultMode, not our options.
        if (user.defaultMode) expect(initialMode).toBe(user.defaultMode);
      });
    },
    150_000,
  );
});
