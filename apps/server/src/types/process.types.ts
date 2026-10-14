/**
 * Process-effect port for the server entry.
 *
 * Why: environment, exit, stderr and signals are what make startup and shutdown hard to
 *   test; injecting them lets a test prove "a bad config exits 1" and "SIGTERM stops the
 *   server once" without killing the test runner.
 *
 * Exports: ProcessIo, PortsFactory.
 * Depends on: types/server, types/settings. Types only.
 */

import type { ExternalPorts } from '#/types/server.types.js';
import type { ServerSettings } from '#/types/settings.types.js';

export interface ProcessIo {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
  stderr(text: string): void;
  exit(code: number): void;
  onSignal(signal: 'SIGINT' | 'SIGTERM', handler: (signal: string) => void): void;
}

/** Builds the external ports from settings; the default is the Claude adapters. */
export type PortsFactory = (settings: ServerSettings, io: ProcessIo) => ExternalPorts;
