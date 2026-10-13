/**
 * Environment that lets `git push` authenticate to GitHub without exposing the token.
 *
 * Why: the installation token must never appear in argv (visible in process listings),
 *   in the remote URL (stored in `.git/config` and echoed in errors), in a git config
 *   file or in logs. Git reads extra config from `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_n` /
 *   `GIT_CONFIG_VALUE_n` environment variables, so the Authorization header is handed to
 *   the one child process through its environment and exists nowhere else. The header is
 *   scoped to https://github.com/ so it is not sent to any other host a redirect names.
 *
 * Exports: buildPushEnv(), redactSecrets().
 * Depends on: none. No IO.
 */

/** Env vars for one authenticated `git push` to github.com using an installation token. */
export function buildPushEnv(token: string): Record<string, string> {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');

  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    GIT_TERMINAL_PROMPT: '0',
  };
}

/** Replaces every occurrence of each secret (and the base64 of `x-access-token:<secret>`) in `text`. */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) {
    if (s.length === 0) {
      continue;
    }

    const basic = Buffer.from(`x-access-token:${s}`).toString('base64');
    out = out.split(basic).join('[redacted]').split(s).join('[redacted]');
  }

  return out;
}
