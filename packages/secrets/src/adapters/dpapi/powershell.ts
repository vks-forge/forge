/**
 * DPAPI protect / unprotect through a fixed Windows PowerShell script.
 *
 * Why: Windows ties DPAPI (CurrentUser scope) to the logged-in user, so a blob copied to
 *   another account or machine is useless. .NET exposes it as `ProtectedData`, reachable
 *   without a native dependency by spawning `powershell.exe`. The plaintext travels as
 *   base64 on the child's stdin and the result comes back on stdout: it is never in argv
 *   (visible in process listings) or the environment, and no temp file is written. The
 *   script text is a constant, there is no shell, and nothing the caller passes is ever
 *   interpolated into it.
 *
 * Exports: dpapiProtect(), dpapiUnprotect().
 * Depends on: node:child_process, @forge/core (CrashError). IO: spawns powershell.exe.
 */

import { spawn } from 'node:child_process';
import { CrashError } from '@forge/core';
import type { PowerShellOptions } from '#/types/dpapi.types.js';

const PRELUDE = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Security',
  '$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',
].join('; ');

const PROTECT = `${PRELUDE}; [Console]::Out.Write([Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')))`;
const UNPROTECT = `${PRELUDE}; [Console]::Out.Write([Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, 'CurrentUser')))`;

const STDERR_TAIL = 500;

function runScript(
  script: string,
  base64In: string,
  opts: PowerShellOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      opts.powershell ?? 'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => (out += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (err += d));
    child.on('error', (cause) =>
      reject(new CrashError(`could not run PowerShell: ${cause.message}`, { cause })),
    );

    child.on('close', (code) => {
      if (code === 0) {
        return resolve(out.trim());
      }

      reject(
        new CrashError(
          `DPAPI call failed (exit ${code}): ${err.trim().slice(-STDERR_TAIL)}`,
        ),
      );
    });

    child.stdin.on('error', () => undefined); // a dead child is reported by 'close'
    child.stdin.end(base64In);
  });
}

/** Encrypts `plain` for the current Windows user. */
export async function dpapiProtect(
  plain: Uint8Array,
  opts: PowerShellOptions = {},
): Promise<Uint8Array> {
  const b64 = await runScript(PROTECT, Buffer.from(plain).toString('base64'), opts);

  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** Decrypts a blob made by {@link dpapiProtect} for the same Windows user. */
export async function dpapiUnprotect(
  blob: Uint8Array,
  opts: PowerShellOptions = {},
): Promise<Uint8Array> {
  const b64 = await runScript(UNPROTECT, Buffer.from(blob).toString('base64'), opts);

  return new Uint8Array(Buffer.from(b64, 'base64'));
}
