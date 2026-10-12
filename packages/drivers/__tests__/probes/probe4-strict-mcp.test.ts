/**
 * Probe 4: whether `strictMcpConfig` on the ACP adapter keeps user and project MCP servers
 * away from a Worker.
 *
 * Why: A Worker that silently inherits the operator's MCP servers (browser, trading, file or
 * network tools) gets capabilities Forge never granted, and those calls may bypass the
 * tool catalogue that `admit()` reasons about. The ACP adapter already ignores
 * `settingSources: []` for permissions (d-0048 item 6), so the Director needs measured proof
 * of whether `strictMcpConfig: true` closes the MCP door before slice 3 relies on it (d-0049).
 *
 * Pins: with strictMcpConfig true and empty mcpServers/settingSources the agent lists no
 *   `mcp__` tool; the control session (strictMcpConfig false) is recorded, not asserted, since
 *   it depends on the operator's machine. Observations go to .forge/data/probes/4/observed.json.
 * Depends on: helpers/acp-probe, helpers/probe-env. IO: spawns the ACP adapter (billable,
 *   capped at $0.05 per session), writes under .forge/data/probes/4/, reads ~/.claude.json
 *   read-only for MCP server names.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeOptionsMeta, promptTurn, withAcp } from '#tests/helpers/acp-probe.js';
import {
  freshProbeDir,
  freshTempCwd,
  PROBES_ENABLED,
  REPO_ROOT,
  SKIP_REASON,
} from '#tests/helpers/probe-env.js';

const probe = it.skipIf(!PROBES_ENABLED);

const PROMPT =
  'list the names of every MCP tool available to you, one per line, or say NONE';

/** Top-level MCP server names only; commands, URLs and env are never read into the report. */
function serverNames(file: string): string[] {
  try {
    const j = JSON.parse(readFileSync(file, 'utf8')) as {
      mcpServers?: Record<string, unknown>;
    };
    return Object.keys(j.mcpServers ?? {});
  } catch {
    return [];
  }
}

/** Runs one session and returns the agent's text plus any `mcp__` names seen anywhere. */
async function ask(
  overrides: Record<string, unknown>,
): Promise<{ text: string; mcpNames: string[]; toolCalls: number }> {
  return withAcp(async (h) => {
    const session = await h.ctx
      .buildSession({
        cwd: freshTempCwd(),
        mcpServers: [],
        _meta: claudeOptionsMeta(2, overrides),
      })
      .start();
    await h.ctx.request('session/set_mode', {
      sessionId: session.sessionId,
      modeId: 'default',
    });
    const turn = await promptTurn(session, PROMPT);
    const blob = turn.text + JSON.stringify(turn.updates);
    const mcpNames = [...new Set(blob.match(/mcp__[A-Za-z0-9_-]+/g) ?? [])];
    return {
      text: turn.text,
      mcpNames,
      toolCalls: turn.updateKinds.filter((k) => k === 'tool_call').length,
    };
  });
}

describe('probe 4: strictMcpConfig on ACP (d-0049)', () => {
  probe(
    `strict config lists no MCP tool; control records what leaks ${SKIP_REASON}`,
    async () => {
      const dir = freshProbeDir('4');
      const userServers = serverNames(join(homedir(), '.claude.json'));
      const projectServers = serverNames(join(REPO_ROOT, '.mcp.json'));

      const strict = await ask({
        strictMcpConfig: true,
        mcpServers: {},
        settingSources: [],
      });
      const control = await ask({ strictMcpConfig: false });

      const observed = {
        userServers,
        projectServers,
        strict: { ...strict, text: strict.text.slice(0, 600) },
        control: { ...control, text: control.text.slice(0, 600) },
        controlMentionsUserServer: userServers.filter((n) =>
          control.mcpNames.some((m) => m.startsWith(`mcp__${n}`)),
        ),
      };
      writeFileSync(join(dir, 'observed.json'), JSON.stringify(observed, null, 2));
      console.info('probe4 observed', JSON.stringify(observed));

      expect(strict.mcpNames).toEqual([]);
      expect(strict.text.length).toBeGreaterThan(0);
      expect(control.text.length).toBeGreaterThan(0);
    },
    300_000,
  );
});
