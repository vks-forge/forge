/**
 * Resolves the `claude` executable to something the driver can actually spawn.
 *
 * Why: the driver and the Director start `claude` without a shell (so a prompt or path
 *   can never be re-parsed as a command). On Windows that means only a real `.exe` can be
 *   started: npm installs `claude.cmd`, which `CreateProcess` refuses, and the failure
 *   would otherwise surface minutes later as a Director step crashing mid-ticket. Checking
 *   once at startup turns it into one readable line that says what to set.
 *
 * Exports: resolveClaudeBinary().
 * Depends on: node:path (win32 flavour), @forge/core (InvalidInputError), types/claude/claude-binary.
 *   No IO; file existence is injected.
 */

import { win32 } from 'node:path';
import { InvalidInputError } from '@forge/core';
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

  throw new InvalidInputError(
    `claude executable "${binary}" was not found on PATH; install Claude Code or set FORGE_CLAUDE_BINARY to claude.exe`,
  );
}
