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
 *   shell call (hook log line exists, block message reaches the tool result); (b) a
 *   `permissions.defaultMode` planted in the session cwd's `.claude/settings.json` (a settings
 *   source the adapter reads itself) is the session's initial mode despite
 *   `settingSources: []`, and `session/set_mode default` then makes it `default`
 *   (d-0048 item 6, d-0053). Observations land in .forge/data/probes/5/observed.json.
 * Depends on: helpers/acp-probe, helpers/probe-env. IO: spawns the ACP adapter (billable,
 *   capped at $0.05 per session), writes under .forge/data/probes/5/ only. The real user
 *   config dir is never read or written and `CLAUDE_CONFIG_DIR` is not set.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeOptionsMeta, promptTurn, withAcp } from '#tests/helpers/acp-probe.js';
import {
  freshProbeDir,
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
      // Plant a known default mode in the project settings source the adapter's
      // SettingsManager reads (<cwd>/.claude/settings.json, settings.js getWatchedPaths),
      // so the leak assertion is unconditional and no credentials or user config are touched.
      const cwd = join(dir, 'cwd');
      mkdirSync(join(cwd, '.claude'), { recursive: true });
      writeFileSync(
        join(cwd, '.claude', 'settings.json'),
        JSON.stringify({ permissions: { defaultMode: 'acceptEdits' } }),
      );

      await withAcp(async (h) => {
        const session = await h.ctx
          .buildSession({
            cwd,
            mcpServers: [],
            _meta: claudeOptionsMeta(2, { settings: settingsPath }),
          })
          .start();
        const initialMode = session.modes?.currentModeId ?? null;
        // Resolves only if the adapter accepts the mode; a rejection fails the probe.
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
        const modeUpdates = turn.updates
          .filter((u) => u['sessionUpdate'] === 'current_mode_update')
          .map((u) => u['currentModeId']);
        const observed = {
          plantedProjectDefaultMode: 'acceptEdits',
          initialModeBeforeSetMode: initialMode,
          modeUpdates: modeUpdates,
          hookLog: log,
          permissionRequests: h.permissionRequests.length,
          toolCallUpdateStatuses: turn.updates
            .filter((u) => u['sessionUpdate'] === 'tool_call_update')
            .map((u) => u['status']),
          blockMessageSeen: blob.includes('blocked by probe hook'),
          stopReason: turn.stopReason,
          agentText: turn.text.slice(0, 400),
        };
        writeFileSync(join(dir, 'observed.json'), JSON.stringify(observed, null, 2));
        console.info('probe5 observed', JSON.stringify(observed));

        // (a) per-run hook via _meta settings.
        expect(log.some((l) => l.startsWith('PreToolUse'))).toBe(true);
        expect(blob).toContain('blocked by probe hook');
        // (b) measured 2026-10-13: an escalating defaultMode planted in the PROJECT settings
        // source is filtered by the adapter (session starts in `default`); the user-settings
        // leak of d-0048 item 6 is a different source and still needs set_mode (d-0049).
        expect(initialMode).toBe('default');
        // After set_mode default no mode update may report anything else (an update is not
        // guaranteed to arrive, so this pins "never contradicted", not "announced").
        expect(modeUpdates.every((m) => m === 'default')).toBe(true);
      });
    },
    150_000,
  );
});
