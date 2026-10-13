/**
 * Pins: the rendered settings are fail-closed and name both shell tools.
 *
 * Why: an ignored or fail-open hooks block means a Worker with no chokepoint (probe 2).
 *
 * Depends on: src/adapters/claude/hooks/settings-file.
 */

import { describe, expect, it } from 'vitest';
import {
  renderAcpMeta,
  renderHookSettings,
} from '#/adapters/claude/hooks/settings-file.js';

describe('renderHookSettings', () => {
  const s = renderHookSettings({
    hookJsPath: 'C:\\Program Files\\forge\\bin\\hook.js',
    configPath: 'D:\\x\\.forge\\data\\runs\\r1\\hook.json',
    timeoutMs: 4000,
  });

  it('registers four events, each onFailure block with a timeout above the hook timeout', () => {
    expect(Object.keys(s.hooks)).toEqual([
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
    ]);
    for (const groups of Object.values(s.hooks))
      for (const h of groups?.[0]?.hooks ?? []) {
        expect(h).toMatchObject({ type: 'command', onFailure: 'block', timeout: 6 });
      }
  });

  it('quotes forward-slash paths and matches every tool by default', () => {
    expect(s.hooks.PreToolUse?.[0]?.hooks[0]?.command).toBe(
      'node "C:/Program Files/forge/bin/hook.js" --config "D:/x/.forge/data/runs/r1/hook.json"',
    );
    expect(s.hooks.PreToolUse?.[0]?.matcher).toBe('.*');
    expect(s.hooks.SessionStart?.[0]).not.toHaveProperty('matcher');
  });

  it('honours an events subset and ACP meta', () => {
    const only = renderHookSettings({
      hookJsPath: '/h.js',
      configPath: '/c.json',
      timeoutMs: 1000,
      events: ['PreToolUse'],
      matcher: 'Bash|PowerShell',
    });
    expect(Object.keys(only.hooks)).toEqual(['PreToolUse']);
    expect(renderAcpMeta('/s.json')).toEqual({
      claudeCode: { options: { settings: '/s.json' } },
    });
  });
});
