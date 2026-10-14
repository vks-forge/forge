/**
 * Structured logging: one JSON object per line.
 *
 * Why: the server's output is read by a person tailing a terminal today and by a log
 *   shipper later; JSON lines serve both. Logging never throws (a broken stderr must not
 *   take down a tick), and a field whose key looks like a credential is replaced, so a
 *   careless `log('...', { token })` cannot leak a run token or key into a file.
 *
 * Exports: createJsonLogger().
 * Depends on: types/engine (Logger). IO: the injected `write`.
 */

import type { LogLevel, Logger } from '#/types/engine.types.js';

const ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SECRET_KEY = /token|secret|password|authorization|private|key/i;

function redact(fields: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[redacted]' : v]),
  );
}

/** A logger writing JSON lines through `write`, dropping levels below `min`. */
export function createJsonLogger(
  write: (line: string) => void,
  min: LogLevel = 'info',
  now: () => Date = () => new Date(),
): Logger {
  return (level, message, fields) => {
    if (ORDER[level] < ORDER[min]) {
      return;
    }

    try {
      write(
        `${JSON.stringify({
          ts: now().toISOString(),
          level,
          message,
          ...(fields ? { fields: redact(fields) } : {}),
        })}\n`,
      );
    } catch {
      // Logging must never break the caller.
    }
  };
}
