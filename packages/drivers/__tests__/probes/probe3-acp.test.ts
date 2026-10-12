/**
 * Probe 3: the pinned ACP adapter starts, reports account auth, honours the d-0035 session
 * options, and routes permission prompts to our client.
 *
 * Why: The primary Claude engine is the ACP server. The Director's safety depends on it honouring our session options (no inherited settings, no bypass mode, budget and turn caps) and on routing every permission prompt to us rather than auto-approving. This pins both against the pinned adapter version (d-0035).
 *
 * Pins: initialize succeeds and an `account` auth status is pushed; a plain reply completes
 *   with "pong" and no permission request; a Bash/shell request produces
 *   `session/request_permission` (we deny) and the command output never appears.
 * Depends on: helpers/acp-probe, helpers/probe-env, the pinned ACP adapter. IO: spawns the
 *   adapter and the bundled claude binary (billable, capped at $0.05 per session).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeOptionsMeta, promptTurn, withAcp } from '#tests/helpers/acp-probe.js';
import { freshTempCwd, PROBES_ENABLED, SKIP_REASON } from '#tests/helpers/probe-env.js';

const probe = it.skipIf(!PROBES_ENABLED);

describe('probe 3: ACP adapter (d-0035)', () => {
  probe(
    `initialize reports auth info and a plain reply needs no permission ${SKIP_REASON}`,
    async () => {
      await withAcp(async (h) => {
        expect(h.init.protocolVersion).toBe(1);
        expect(h.init.agentInfo?.name).toBe('@agentclientprotocol/claude-agent-acp');
        expect(h.init.agentCapabilities?.loadSession).toBe(true);

        const session = await h.ctx
          .buildSession({
            cwd: freshTempCwd(),
            mcpServers: [],
            _meta: claudeOptionsMeta(1),
          })
          .start();
        const turn = await promptTurn(session, 'reply with the single word pong');

        const modeIds = session.modes?.availableModes.map((m) => m.id) ?? [];
        expect(modeIds.length).toBeGreaterThan(0);
        expect(modeIds).not.toContain('bypassPermissions');
        expect(turn.text.toLowerCase()).toContain('pong');
        expect(turn.stopReason).toBe('end_turn');
        expect(h.permissionRequests).toHaveLength(0);
        const statuses = h.authUpdates as { authStatus?: { kind?: string } }[];
        expect(statuses.length).toBeGreaterThan(0);
        expect(statuses.some((s) => s.authStatus?.kind === 'account')).toBe(true);
      });
    },
    150_000,
  );

  probe(
    `a shell command reaches our client as session/request_permission; deny blocks it ${SKIP_REASON}`,
    async () => {
      await withAcp(async (h) => {
        const cwd = freshTempCwd();
        const session = await h.ctx
          .buildSession({ cwd, mcpServers: [], _meta: claudeOptionsMeta(2) })
          .start();
        // The adapter's own SettingsManager reads the user's settings.json even with
        // settingSources [], so the initial mode follows the user's permissions.defaultMode
        // (acceptEdits here, which auto-approves shell writes). The driver must therefore
        // pin the mode explicitly after every session/new.
        await h.ctx.request('session/set_mode', {
          sessionId: session.sessionId,
          modeId: 'default',
        });

        const turn = await promptTurn(
          session,
          'use the shell tool to run the command: echo hi > probe-output.txt',
        );

        expect(h.permissionRequests.length).toBeGreaterThan(0);
        const req = h.permissionRequests[0];
        expect(req?.sessionId).toBe(session.sessionId);
        expect(req?.toolCall.toolCallId).toBeTruthy();
        expect(req?.options.length).toBeGreaterThan(0);
        expect(req?.options.some((o) => o.kind.startsWith('reject'))).toBe(true);
        expect(turn.updateKinds).toContain('tool_call');
        expect(existsSync(join(cwd, 'probe-output.txt'))).toBe(false);
        expect(turn.stopReason).not.toBe('refusal');
      });
    },
    150_000,
  );
});
