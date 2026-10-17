/**
 * Tells whether a tool call announced by the harness already carries its input.
 *
 * Why: the ACP adapter announces a tool call the moment the model starts writing it, with
 *   an empty input, and the complete input arrives seconds later (a long file write takes
 *   as long as the model needs to type it). The PreToolUse hook can only run once the input
 *   is complete, so the receipt cross-check must not start its grace clock on an empty
 *   announcement: it would kill a healthy run that was still writing its second tool call.
 *
 * Exports: hasInput(), isHarnessRejection().
 * Depends on: nothing. No IO.
 */

/**
 * True for an error result Claude Code produced itself while validating the call (a
 * `<tool_use_error>` wrapper, e.g. an Edit whose old string matches several places). That
 * validation runs before PreToolUse, so the tool never ran and no receipt exists; the
 * cross-check must not read that as a bypassed hook. A success, or an error without the
 * wrapper, is never a rejection: those calls ran and still need their receipt.
 */
export function isHarnessRejection(output: unknown, isError: boolean): boolean {
  if (!isError) {
    return false;
  }

  const text = typeof output === 'string' ? output : (JSON.stringify(output) ?? '');

  return text.includes('<tool_use_error>');
}

/** False for a missing or empty object input, the shape of a call whose input is still streaming. */
export function hasInput(input: unknown): boolean {
  if (input === undefined || input === null) {
    return false;
  }

  if (typeof input === 'object' && !Array.isArray(input)) {
    return Object.keys(input).length > 0;
  }

  return true;
}
