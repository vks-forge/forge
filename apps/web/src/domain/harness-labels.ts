/**
 * Human names for harnesses and their sign-in methods.
 *
 * Why: the registry id (`claude`) is a key, not a name. Owners look for "Claude Code", and
 *   the list row, the page header and the test result must all say the same words for how a
 *   harness signs in, or the same fact reads differently on three screens.
 *
 * Exports: harnessName(), MODE_WORDS.
 * Depends on: nothing. Pure.
 */

const NAMES: Readonly<Record<string, string>> = {
  claude: 'Claude Code',
};

/** The product name for a harness id, or the id itself when Forge has no better name. */
export function harnessName(id: string): string {
  return NAMES[id] ?? id;
}

export const MODE_WORDS = {
  login: 'Signed-in account',
  api_key: 'API key',
  oauth_token: 'OAuth token',
} as const;
