/**
 * Restricting a file to the current user: the Windows ACL adapter.
 *
 * Why: `chmod 0600` does nothing on Windows, where access is an ACL inherited from the
 *   parent folder (usually readable by Administrators and sometimes by other accounts).
 *   `icacls <file> /inheritance:r /grant:r <user>:F` drops the inherited entries, grants full
 *   control to the current user and removes SYSTEM and Administrators, which the file keeps
 *   otherwise; an administrator can still take ownership of it, as with any file. It runs as a child process, so it is a small
 *   adapter the install-token code takes as a port; failure is reported to the caller, which
 *   decides (the token code logs a warning and carries on).
 *
 * Exports: windowsRestrictFile(), nodeRestrictFile().
 * Depends on: node:child_process, node:fs/promises, node:os, node:util, types/auth.
 *   IO: runs `icacls`, changes a file's permissions.
 */

import { execFile } from 'node:child_process';
import { chmod } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { promisify } from 'node:util';
import type { RestrictFile } from '#/types/auth.types.js';

const run = promisify(execFile);

// Well-known SIDs, so the command works on any display language of Windows.
const SYSTEM_SID = '*S-1-5-18';
const ADMINISTRATORS_SID = '*S-1-5-32-544';

/** `icacls` that leaves `username` as the only entry on the file. */
export function windowsRestrictFile(username: string): RestrictFile {
  return async (path) => {
    await run(
      'icacls',
      [
        path,
        '/inheritance:r',
        '/grant:r',
        `${username}:F`,
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
  return platform === 'win32'
    ? windowsRestrictFile(userInfo().username)
    : (path) => chmod(path, 0o600);
}
