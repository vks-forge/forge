/**
 * Data home — where Forge keeps its database, secrets, runs and Worker checkouts.
 *
 * Why: Forge is an installed product used across many repositories (d-0098), so its own
 *   files cannot live in any checkout. They live in one per-user folder, outside every
 *   Worker cwd, which the policy floors then deny by absolute path. The server, the CLI
 *   and the floors must all derive paths from the same answer, so the rule is one pure
 *   function over (platform, environment, home directory): `FORGE_HOME` (dev and tests) beats
 *   the choice recorded in the bootstrap file, which beats the platform default. A relative
 *   or empty answer is refused rather than resolved against the cwd, because a home that
 *   moves with the cwd would silently split the data.
 *
 * Exports: BOOTSTRAP_FILE_NAME, resolveDataHome(), bootstrapFilePath(), parseBootstrapFile(),
 *   dataHomeLayout().
 * Depends on: schemas/bootstrap-home, shared/errors,
 *   types/data-home. No IO.
 */

import { BootstrapHomeFile } from '#/schemas/bootstrap-home.js';
import { InvalidInputError } from '#/shared/errors.js';
import type {
  DataHomePathOps as PathOps,
  DataHomeInputs,
  DataHomeLayout,
  DataHomePlatform,
} from '#/types/data-home.types.js';

/** Name of the bootstrap file inside the platform config directory. */
export const BOOTSTRAP_FILE_NAME = 'forge-home.json';

/** Drops one trailing separator, except on a root such as `/` or `C:\`. */
const trimEnd = (p: string): string =>
  p.length > 1 && /[\\/]$/.test(p) && !/^[a-zA-Z]:[\\/]$/.test(p) ? p.slice(0, -1) : p;

function makeOps(sep: '\\' | '/', absolute: RegExp): PathOps {
  const unify = (p: string): string => (sep === '/' ? p : p.replaceAll('/', '\\'));
  const normalize = (p: string): string => trimEnd(unify(p));

  return {
    sep,
    isAbsolute: (p) => absolute.test(p),
    normalize,
    join: (...parts) => normalize(parts.map(trimEnd).join(sep)),
  };
}

const WIN = makeOps('\\', /^(?:[a-zA-Z]:[\\/]|[\\/])/);
const POSIX = makeOps('/', /^\//);

const pathFor = (platform: DataHomePlatform): PathOps =>
  platform === 'win32' ? WIN : POSIX;

const absoluteEnv = (p: PathOps, value: string | undefined): string | undefined =>
  value !== undefined && p.isAbsolute(value) ? value : undefined;

function requireAbsolute(p: PathOps, value: string, what: string): string {
  if (value === '' || !p.isAbsolute(value)) {
    throw new InvalidInputError(`${what} must be an absolute path, got "${value}"`);
  }

  return p.normalize(value);
}

/** The platform default data home (no override applied). */
function defaultHome(i: DataHomeInputs, p: PathOps): string {
  if (i.platform === 'win32') {
    const local =
      absoluteEnv(p, i.env.LOCALAPPDATA) ?? p.join(i.homedir, 'AppData', 'Local');

    return p.join(local, 'Forge');
  }

  if (i.platform === 'darwin') {
    return p.join(i.homedir, 'Library', 'Application Support', 'Forge');
  }

  const xdg = absoluteEnv(p, i.env.XDG_DATA_HOME) ?? p.join(i.homedir, '.local', 'share');

  return p.join(xdg, 'forge');
}

/**
 * The data home folder: `FORGE_HOME` (dev/test only), else the bootstrap choice, else the
 * platform default. Throws InvalidInputError for a relative override.
 */
export function resolveDataHome(i: DataHomeInputs): string {
  const p = pathFor(i.platform);
  const forced = i.env.FORGE_HOME;
  if (forced !== undefined && forced !== '') {
    return requireAbsolute(p, forced, 'FORGE_HOME');
  }

  if (i.bootstrapHome !== undefined) {
    return requireAbsolute(p, i.bootstrapHome, 'forge-home.json dataHome');
  }

  return defaultHome(i, p);
}

/** Where `forge-home.json` is looked for: the per-user config directory of the platform. */
export function bootstrapFilePath(i: Omit<DataHomeInputs, 'bootstrapHome'>): string {
  const p = pathFor(i.platform);
  if (i.platform === 'win32') {
    const roaming =
      absoluteEnv(p, i.env.APPDATA) ?? p.join(i.homedir, 'AppData', 'Roaming');

    return p.join(roaming, 'Forge', BOOTSTRAP_FILE_NAME);
  }

  if (i.platform === 'darwin') {
    return p.join(
      i.homedir,
      'Library',
      'Application Support',
      'Forge',
      BOOTSTRAP_FILE_NAME,
    );
  }

  const cfg = absoluteEnv(p, i.env.XDG_CONFIG_HOME) ?? p.join(i.homedir, '.config');

  return p.join(cfg, 'forge', BOOTSTRAP_FILE_NAME);
}

/** Parses the text of `forge-home.json` into the chosen absolute folder; throws InvalidInputError. */
export function parseBootstrapFile(text: string, platform: DataHomePlatform): string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InvalidInputError(`${BOOTSTRAP_FILE_NAME} is not valid JSON`);
  }

  const parsed = BootstrapHomeFile.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidInputError(
      `${BOOTSTRAP_FILE_NAME} must be {"dataHome": "<absolute folder>"}`,
    );
  }

  const p = pathFor(platform);
  if (!p.isAbsolute(parsed.data.dataHome)) {
    throw new InvalidInputError(
      `${BOOTSTRAP_FILE_NAME} dataHome must be an absolute path, got "${parsed.data.dataHome}"`,
    );
  }

  return p.normalize(parsed.data.dataHome);
}

/** Every path Forge owns under `home`, joined with the separator of `platform`. */
export function dataHomeLayout(home: string, platform: DataHomePlatform): DataHomeLayout {
  const p = pathFor(platform);
  const at = (name: string): string => p.join(home, name);

  return {
    home,
    dbPath: at('forge.db'),
    secretsDir: at('secrets'),
    memoryDir: at('memory'),
    worktreesDir: at('worktrees'),
    runsDir: at('runs'),
    backupsDir: at('backups'),
    logsDir: at('logs'),
    serverJsonPath: at('server.json'),
  };
}
