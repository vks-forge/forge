/**
 * Detects a Worker's `ask_director` / `report_blocked` call and the interaction it opened.
 *
 * Why: a Worker that cannot go on asks a human through the Forge MCP server, which stores
 *   the interaction and tells the Worker to stop. The driver is the only party that sees
 *   both the end of the run and the Worker's last tool result, so it is the one that can
 *   tell the Director "this run is paused on interaction X, resume it with the answer"
 *   instead of reporting a finished run. The interaction id comes back in the tool result
 *   as JSON; harnesses wrap that text differently (a bare string, or content blocks), so
 *   the finder walks the value rather than assuming one shape.
 *
 * Exports: isAskTool(), findInteractionId().
 * Depends on: nothing. No IO.
 */

const ASK_TOOLS = ['ask_director', 'report_blocked'];
const MAX_DEPTH = 6;

/** True for the run's own Forge MCP `ask_director` or `report_blocked` tool. */
export function isAskTool(toolName: string, mcpIdentity: string): boolean {
  return ASK_TOOLS.some((t) => toolName === `mcp__${mcpIdentity}__${t}`);
}

/** The `interaction_id` inside a tool result, however the harness wrapped it; null if none. */
export function findInteractionId(value: unknown, depth = 0): string | null {
  if (depth > MAX_DEPTH) {
    return null;
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text.startsWith('{') && !text.startsWith('[')) {
      return null;
    }

    try {
      return findInteractionId(JSON.parse(text), depth + 1);
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findInteractionId(item, depth + 1);
      if (found) {
        return found;
      }
    }

    return null;
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const direct = record['interaction_id'];
    if (typeof direct === 'string' && direct.length > 0) {
      return direct;
    }

    for (const inner of Object.values(record)) {
      const found = findInteractionId(inner, depth + 1);
      if (found) {
        return found;
      }
    }
  }

  return null;
}
