/**
 * Server secrets planted in the host env of the driver and Director rigs.
 *
 * Why: a Worker runs model-chosen shell commands, so anything in its environment is one
 *   `env` call from the model. The rigs put the server's real secret names in the host env
 *   so tests can pin that none of them reach a harness child.
 *
 * Exports: SECRET_ENV, SECRET_NAMES.
 * Depends on: nothing. No IO.
 */

export const SECRET_ENV: Readonly<Record<string, string>> = {
  FORGE_CATALOGUE_KEY: 'secret-catalogue-key',
  FORGE_GH_APP_ID: '123',
  ANTHROPIC_API_KEY: 'sk-secret',
  AWS_SECRET_ACCESS_KEY: 'aws-secret',
  GITHUB_TOKEN: 'ghp_secret',
};

export const SECRET_NAMES: readonly string[] = Object.keys(SECRET_ENV);
