/**
 * Hook stdin payload fixtures for the Claude hook client tests.
 *
 * Why: the client tests need payloads shaped like the ones the harness really pipes to
 *   the hook (probes 2 and 5: `hook_event_name` and `tool_name` on stdin, `PowerShell`
 *   on the Windows CLI and `Bash` on ACP). Building them once keeps every test on the
 *   same shapes.
 *
 * Exports: pre(), post(), failure(), sessionStart().
 * Depends on: nothing. No IO.
 */

export const sessionStart = () => ({
  hook_event_name: 'SessionStart',
  source: 'startup',
});
export const pre = (tool = 'PowerShell', command = 'echo hi', id?: string) => ({
  hook_event_name: 'PreToolUse',
  tool_name: tool,
  tool_input: { command },
  ...(id ? { tool_use_id: id } : {}),
});
export const post = (tool = 'PowerShell', id?: string) => ({
  hook_event_name: 'PostToolUse',
  tool_name: tool,
  tool_input: { command: 'echo hi' },
  tool_response: { stdout: 'hi' },
  ...(id ? { tool_use_id: id } : {}),
});
export const failure = (tool = 'PowerShell', id?: string) => ({
  hook_event_name: 'PostToolUseFailure',
  tool_name: tool,
  tool_input: {},
  error: 'boom',
  ...(id ? { tool_use_id: id } : {}),
});
