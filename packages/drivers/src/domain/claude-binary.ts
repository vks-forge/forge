/**
 * Resolves the `claude` executable to something the driver can actually spawn.
 *
 * Why: the driver and the Director start `claude` without a shell (so a prompt or path
 *   can never be re-parsed as a command). On Windows that means only a real `.exe` can be
 *   started: npm installs `claude.cmd`, which `CreateProcess` refuses, and the failure
 *   would otherwise surface minutes later as a Director step crashing mid-ticket. Checking
 *   once at startup turns it into one readable line that says what to set.
 *
 *   The ACP adapter needs the same answer as an absolute path (`CLAUDE_CODE_EXECUTABLE`), so
 *   `resolveInstalledClaude` also finds the file on POSIX PATHs, and a missing install is a
 *   `HarnessNotInstalledError` that names the install page instead of a bare "not found"
 *   (d-0087, d-0101).
 *
 * Exports: resolveClaudeBinary(), resolveInstalledClaude(), toForwardSlashes().
 * Depends on: node:path, @forge/core (InvalidInputError), shared/errors, types/claude/claude-binary.
 *   No IO; file existence is injected.
 */

import { posix, win32 } from 'node:path';
import { InvalidInputError } from '@forge/core';
import { HarnessNotInstalledError } from '#/shared/errors.js';
import type { ResolveBinaryOptions } from '#/types/claude/claude-binary.types.js';

const SPAWNABLE = ['.exe', '.com'];
const SHIMS = ['.cmd', '.bat'];

function candidates(binary: string, pathVar: string | undefined): string[] {
  if (/[\/]/.test(binary) || win32.isAbsolute(binary)) {
    return [binary];
  }

  return (pathVar ?? '')
    .split(';')
    .filter((dir) => dir !== '')
    .map((dir) => win32.join(dir, binary));
}

/**
 * The spawnable path of `binary`. Off Windows the name is returned unchanged; on Windows a
 * missing binary or a `.cmd`/`.bat` shim throws InvalidInputError naming `FORGE_CLAUDE_BINARY`.
 */
export function resolveClaudeBinary(binary: string, opts: ResolveBinaryOptions): string {
  if (opts.platform !== 'win32') {
    return binary;
  }

  let shim: string | null = null;
  for (const base of candidates(binary, opts.pathVar)) {
    const ext = win32.extname(base).toLowerCase();
    const tries = ext === '' ? [...SPAWNABLE, ...SHIMS].map((e) => base + e) : [base];
    for (const file of tries) {
      const fileExt = win32.extname(file).toLowerCase();
      if (!opts.exists(file)) {
        continue;
      }

      if (SPAWNABLE.includes(fileExt)) {
        return file;
      }

      if (SHIMS.includes(fileExt)) {
        shim ??= file;
      }
    }
  }

  if (shim) {
    throw new InvalidInputError(
      `claude resolves to ${shim}, a script shim that cannot be started without a shell; set FORGE_CLAUDE_BINARY to the real claude.exe`,
    );
  }

  throw new HarnessNotInstalledError(
    `claude executable "${binary}" was not found on PATH; or set FORGE_CLAUDE_BINARY / the harness binary path to claude.exe`,
  );
}

/**
 * The absolute spawnable path of the installed `claude` on any platform. Windows follows
 * `resolveClaudeBinary`; elsewhere `binary` is used as given when it has a directory part,
 * else searched on the `:`-separated PATH. A missing file throws HarnessNotInstalledError;
 * there is never a fallback to another copy.
 */
export function resolveInstalledClaude(
  binary: string,
  opts: ResolveBinaryOptions,
): string {
  if (opts.platform === 'win32') {
    return resolveClaudeBinary(binary, opts);
  }

  const found = (
    binary.includes('/')
      ? [binary]
      : (opts.pathVar ?? '')
          .split(':')
          .filter((dir) => dir !== '')
          .map((dir) => posix.join(dir, binary))
  ).find((file) => opts.exists(file));

  if (!found) {
    throw new HarnessNotInstalledError(
      `claude executable "${binary}" was not found on PATH; or set the harness binary path`,
    );
  }

  return found;
}

/** A Windows path with forward slashes (`C:/a/claude.exe`): the adapter's `CLAUDE_CODE_EXECUTABLE` needs them (d-0101). */
export function toForwardSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}
