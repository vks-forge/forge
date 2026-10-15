/**
 * `forge open`: a fresh one-time link that signs the browser in to the control room.
 *
 * Why: the control room must never hold the install token (any script or extension in the
 *   page could copy it), yet the browser has to end up authorised. This CLI runs as the same
 *   user and can read the token file, so it asks the running server for a single-use code
 *   (`POST /auth/open-code`, token-authenticated) and builds `/auth/open?code=...`; the
 *   server turns that into an `HttpOnly` cookie and redirects away, so the code is spent
 *   before the page loads. The token is sent only to a server that has answered `/health`
 *   as Forge and has proved it holds that token (so an impostor on a recycled port never
 *   gets it), and is never printed. The link is also printed, so a headless machine or a
 *   browser that failed to launch still gets a way in during the next minute.
 *
 * Exports: openLink(), openUi().
 * Depends on: services/daemon/{find-server,install-token}, types/daemon. IO: through the ports.
 */

import { ForgeError } from '@forge/core';
import {
  findServer,
  requireTokenProof,
  serverUrl,
} from '#/services/daemon/find-server.js';
import { readInstallToken } from '#/services/daemon/install-token.js';
import type { DaemonPorts } from '#/types/daemon.types.js';

/** The sign-in link for the server on `port`; throws a ForgeError when the server refuses. */
export async function openLink(ports: DaemonPorts, port: number): Promise<string> {
  const token = await readInstallToken(ports);
  await requireTokenProof(ports, port, token);
  const { status, code } = await ports.requestOpenCode(port, token);
  if (status === 401) {
    throw new ForgeError(
      'auth',
      'the server refused the install token; this CLI and the server use different data homes',
    );
  }

  if (status !== 200 || code === undefined) {
    throw new ForgeError('crash', `the server answered ${status} to the sign-in request`);
  }

  return `${serverUrl(port)}/auth/open?code=${encodeURIComponent(code)}`;
}

/** Prints the link for the server on `port` and, when `launch`, opens it in the browser. */
export async function showLink(
  ports: DaemonPorts,
  port: number,
  launch: boolean,
): Promise<void> {
  const link = await openLink(ports, port);
  ports.stdout(`Sign-in link (works once, for one minute): ${link}\n`);
  if (!launch) {
    return;
  }

  try {
    await ports.openBrowser(link);
  } catch {
    ports.stderr(
      'forge: could not start a browser; open the link above, or run `forge open` again for a new one\n',
    );
  }
}

/** Runs the command; resolves with the exit code. */
export async function openUi(ports: DaemonPorts, launch: boolean): Promise<number> {
  const state = await findServer(ports);
  if (state.kind !== 'running') {
    ports.stderr('forge: Forge is not running; start it with `forge start`\n');

    return 1;
  }

  await showLink(ports, state.record.port, launch);

  return 0;
}
