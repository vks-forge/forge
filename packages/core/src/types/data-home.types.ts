/**
 * Types for locating Forge's data home.
 *
 * Why: the data home holds everything Forge owns on the machine (database, secrets, runs,
 *   Worker checkouts). The server and the CLI must agree on where it is, so the inputs of
 *   the pure resolver (platform, environment, home directory) and its output (every path
 *   under the home) are named once here instead of each app inventing its own shape.
 *
 * Exports: DataHomePathOps, DataHomePlatform, DataHomeEnv, DataHomeInputs, DataHomeLayout.
 * Depends on: none. Types only.
 */

/** `process.platform` values the resolver distinguishes; anything else is treated like Linux. */
export type DataHomePlatform = 'win32' | 'darwin' | (string & {});

/** The environment variables the resolver reads; callers pass `process.env` or a literal. */
export type DataHomeEnv = Readonly<Record<string, string | undefined>>;

/** Everything the resolver needs; it reads nothing from the machine itself. */
export interface DataHomeInputs {
  readonly platform: DataHomePlatform;
  readonly env: DataHomeEnv;
  /** The user's home directory (`os.homedir()`). */
  readonly homedir: string;
}

/** Absolute paths of everything under the data home. */
export interface DataHomeLayout {
  readonly home: string;
  readonly dbPath: string;
  readonly secretsDir: string;
  /** One private memory repository per project lives under here (`memory/<slug>/`). */
  readonly memoryDir: string;
  /** One folder per project, one per ticket under it (`worktrees/<slug>/<ticket>`). */
  readonly worktreesDir: string;
  readonly runsDir: string;
  readonly backupsDir: string;
  readonly logsDir: string;
  /** Written by the running server once it listens (pid, port, start time, version); see `ServerRecord`. */
  readonly serverJsonPath: string;
  /** The install token every API call must carry (`Authorization: Bearer`); a user-only file. */
  readonly installTokenPath: string;
  /** Held exclusively by the running server so only one instance runs per data home. */
  readonly serverLockPath: string;
}

/** The few path operations the resolver needs, per platform; core has no node typings, so they are spelled out. */
export interface DataHomePathOps {
  readonly sep: string;
  isAbsolute(p: string): boolean;
  join(...parts: string[]): string;
  normalize(p: string): string;
}
