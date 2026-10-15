/**
 * Minimal git runner for a project's private memory repository.
 *
 * Why: every memory write ends in one commit, made by the long-lived Forge daemon on the
 *   owner's machine. The owner's own git setup (global hooks path, fsmonitor, template
 *   directory, credential helpers, `GIT_*` variables in the daemon's environment) names
 *   programs that git would execute on `add` and `commit` with the daemon's privileges,
 *   and an inherited `GIT_DIR` would send a commit to the wrong repository. This runs git
 *   without a shell, from an allow-listed environment, with global and system config
 *   switched off, hooks and fsmonitor pointed at empty folders, and a fixed Director
 *   identity, and turns a failure into a typed error.
 *
 * Exports: runGit(), readBlobs(), DIRECTOR_NAME, DIRECTOR_EMAIL.
 * Depends on: node:child_process, node:fs/promises, node:path, node:util, @forge/core
 *   (CrashError), types/git. IO: spawns `git`; creates `<memory root>/.forge-git/` (empty folders).
 */

import { execFile, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { CrashError } from '@forge/core';
import type { GitSandbox } from '#/types/git.types.js';

const execFileAsync = promisify(execFile);

export const DIRECTOR_NAME = 'Forge Director';
export const DIRECTOR_EMAIL = 'forge@localhost';

/**
 * The only variables git inherits (matched case-insensitively; Windows spells them freely).
 * Reference: the tools package's RISKY_GIT_ENV lists the `GIT_*` names that must never reach
 * git (GIT_SSH*, GIT_CONFIG*, GIT_EXTERNAL_DIFF, GIT_ASKPASS, GIT_PAGER, GIT_EDITOR,
 * GIT_PROXY_COMMAND, GIT_EXEC_PATH, GIT_TEMPLATE_DIR); an allow-list drops those and every
 * other `GIT_*` at once. Copied, not imported: adapter packages never import each other.
 */
const INHERITED_ENV = new Set([
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
]);

const sandboxes = new Map<string, Promise<GitSandbox>>();

const slash = (path: string): string => path.replaceAll('\\', '/');

/** Empty hooks and template folders and an empty global config, beside the project folders. */
function sandboxFor(repoDir: string): Promise<GitSandbox> {
  const base = join(dirname(repoDir), '.forge-git');
  let made = sandboxes.get(base);
  if (made === undefined) {
    made = (async (): Promise<GitSandbox> => {
      const box = {
        home: join(base, 'home'),
        hooks: join(base, 'hooks'),
        template: join(base, 'template'),
        config: join(base, 'gitconfig'),
      };

      await Promise.all(
        [box.home, box.hooks, box.template].map((d) => mkdir(d, { recursive: true })),
      );

      await writeFile(box.config, '');

      return box;
    })();

    made.catch(() => sandboxes.delete(base));
    sandboxes.set(base, made);
  }

  return made;
}

function gitEnv(box: GitSandbox): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (INHERITED_ENV.has(key.toUpperCase())) {
      env[key] = value;
    }
  }

  env['HOME'] = box.home;
  env['USERPROFILE'] = box.home;
  env['GIT_CONFIG_NOSYSTEM'] = '1';
  env['GIT_CONFIG_GLOBAL'] = box.config;
  env['GIT_TERMINAL_PROMPT'] = '0';

  return env;
}

function gitArgs(box: GitSandbox, args: readonly string[]): string[] {
  const fixed = [
    ['user.name', DIRECTOR_NAME],
    ['user.email', DIRECTOR_EMAIL],
    ['commit.gpgsign', 'false'],
    ['core.autocrlf', 'false'],
    ['core.hooksPath', slash(box.hooks)],
    ['core.fsmonitor', 'false'],
    ['core.untrackedCache', 'false'],
    ['protocol.allow', 'never'],
    ['credential.helper', ''],
  ].flatMap(([key, value]) => ['-c', `${key}=${value}`]);

  const rest = args[0] === 'init' ? [...args, `--template=${slash(box.template)}`] : args;

  return [...fixed, ...rest];
}

function failure(
  args: readonly string[],
  error: unknown,
  stderr: string | undefined,
): CrashError {
  return new CrashError(
    `git ${args[0] ?? ''} failed in the memory repository${stderr ? `: ${stderr}` : ''}`,
    { cause: error },
  );
}

/** Runs `git <args>` in `cwd` and returns trimmed stdout; throws CrashError when git fails or is missing. */
export async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const box = await sandboxFor(cwd);

  try {
    const { stdout } = await execFileAsync('git', gitArgs(box, args), {
      cwd,
      env: gitEnv(box),
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });

    return stdout.trim();
  } catch (error) {
    throw failure(args, error, (error as { stderr?: string }).stderr?.trim());
  }
}

/**
 * Reads blobs by object id through one `git cat-file --batch` process, in the order asked.
 * Returns raw bytes so the caller decides the encoding.
 */
export async function readBlobs(cwd: string, oids: readonly string[]): Promise<Buffer[]> {
  if (oids.length === 0) {
    return [];
  }

  const box = await sandboxFor(cwd);
  const args = ['cat-file', '--batch'];
  const output = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn('git', gitArgs(box, args), {
      cwd,
      env: gitEnv(box),
      windowsHide: true,
    });

    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.stderr.on('data', (c: Buffer) => errors.push(c));
    child.on('error', (error) => reject(failure(args, error, undefined)));
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(
          failure(
            args,
            new Error(`exit ${code}`),
            Buffer.concat(errors).toString().trim(),
          ),
        );
      }
    });

    child.stdin.on('error', () => undefined);
    child.stdin.end(`${oids.join('\n')}\n`);
  });

  return parseBatch(output, oids.length, args);
}

/** Splits `<oid> blob <size>\n<bytes>\n` records; anything else (a missing object) is an error. */
function parseBatch(output: Buffer, count: number, args: readonly string[]): Buffer[] {
  const blobs: Buffer[] = [];
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    const eol = output.indexOf(0x0a, at);
    const header = eol < 0 ? '' : output.toString('utf8', at, eol);
    const match = /^[0-9a-f]+ blob (\d+)$/.exec(header);
    if (match === null) {
      throw failure(args, new Error(`unexpected cat-file output: ${header}`), undefined);
    }

    const size = Number(match[1]);
    blobs.push(output.subarray(eol + 1, eol + 1 + size));
    at = eol + 1 + size + 1;
  }

  return blobs;
}
