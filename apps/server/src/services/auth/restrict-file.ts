/**
 * Restricting a file to the current user: the Windows ACL adapter.
 *
 * Why: `chmod 0600` does nothing on Windows, where access is an ACL inherited from the
 *   parent folder (usually readable by Administrators and sometimes by other accounts).
 *   `icacls <file> /inheritance:r /grant:r *<SID>:F` drops the inherited entries, grants full
 *   control to the current user and removes SYSTEM and Administrators, which the file keeps
 *   otherwise; an administrator can still take ownership of it, as with any file. The grant
 *   names the user by SID, read from `whoami /user`: a bare account name does not resolve for
 *   domain and Entra (Azure AD) accounts, and the file would be left with nobody able to
 *   read it, or with the wrong entry. It runs as a child process, so it is a small
 *   adapter the install-token code takes as a port; failure is reported to the caller, which
 *   decides (the token code logs a warning and carries on).
 *
 * Exports: parseWhoamiSid(), currentUserSid(), windowsRestrictFile(), nodeRestrictFile().
 * Depends on: node:child_process, node:fs/promises, node:path, node:util, types/auth.
 *   IO: runs `whoami` and `icacls`, changes a file's permissions.
 */

import { execFile } from 'node:child_process';
import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { RestrictFile } from '#/types/auth.types.js';

const run = promisify(execFile);

// Well-known SIDs, so the command works on any display language of Windows.
const SYSTEM_SID = '*S-1-5-18';
const ADMINISTRATORS_SID = '*S-1-5-32-544';

const SID_PATTERN = /^S-1-\d+(-\d+)+$/;

/** The SID in the output of `whoami /user /fo csv /nh` (`"DOMAIN\\name","S-1-5-21-..."`); throws when there is none. */
export function parseWhoamiSid(output: string): string {
  const sid = output
    .split(/\r?\n/)
    .flatMap((line) => line.split(','))
    .map((cell) => cell.trim().replace(/^"|"$/g, ''))
    .find((cell) => SID_PATTERN.test(cell));

  if (!sid) {
    throw new Error('could not read the current user SID from whoami');
  }

  return sid;
}

/**
 * The Windows system tool `name`, by full path: a `whoami` from Git for Windows or another
 * toolchain can sit earlier on PATH and does not understand `/user`.
 */
const systemTool = (name: string): string =>
  join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', `${name}.exe`);

/** The SID of the account this process runs as. */
export async function currentUserSid(): Promise<string> {
  const { stdout } = await run(systemTool('whoami'), ['/user', '/fo', 'csv', '/nh'], {
    windowsHide: true,
  });

  return parseWhoamiSid(stdout);
}

/** `icacls` that leaves the current user (by SID) as the only entry on the file. */
export function windowsRestrictFile(
  resolveSid: () => Promise<string> = currentUserSid,
): RestrictFile {
  return async (path) => {
    const sid = await resolveSid();
    await run(
      systemTool('icacls'),
      [
        path,
        '/inheritance:r',
        '/grant:r',
        `*${sid}:F`,
        // Entries the file picks up even with inheritance cut (SYSTEM, Administrators).
        '/remove',
        SYSTEM_SID,
        ADMINISTRATORS_SID,
      ],
      { windowsHide: true },
    );
  };
}

/** The adapter for this machine: icacls on Windows, `chmod 0600` elsewhere. */
export function nodeRestrictFile(platform: string = process.platform): RestrictFile {
  return platform === 'win32' ? windowsRestrictFile() : (path) => chmod(path, 0o600);
}
