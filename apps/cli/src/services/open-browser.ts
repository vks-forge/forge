/**
 * Opens a URL in the user's default browser.
 *
 * Why: `forge start` should land the user in the control room without a copy-paste. The URL
 *   is a loopback address with one base64url code, but it is still passed as a single
 *   argument to the platform opener and never through a shell, so nothing in it can be read
 *   as a command. The opener is detached and its output ignored: it must not keep the CLI
 *   alive or write into the terminal. `rundll32 url.dll,FileProtocolHandler` is used on
 *   Windows because `cmd /c start` would need the URL quoted for a shell.
 *
 * Exports: openBrowser().
 * Depends on: node:child_process. IO: spawns the platform opener.
 */

import { spawn } from 'node:child_process';

function opener(url: string): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return { command: 'rundll32', args: ['url.dll,FileProtocolHandler', url] };
  }

  return {
    command: process.platform === 'darwin' ? 'open' : 'xdg-open',
    args: [url],
  };
}

/** Starts the platform opener; rejects if it cannot be started. */
export function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const { command, args } = opener(url);
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
