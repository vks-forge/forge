/**
 * ConfigSource decorator for the debug trace: every settings save becomes an entry.
 *
 * Why: the engine reads the effective config each tick and a run records the version it
 *   started under, so "when did the settings change, who changed them and to what" is often the
 *   missing fact when a card behaves oddly (d-0163). Saves go through the ConfigSource rather
 *   than storage, so this thin wrapper logs the full saved document with its author and
 *   reason, and a rejected save (version conflict, invalid document) as a warning before the
 *   error is rethrown unchanged. Reads are not logged.
 *
 * Exports: traceConfigWrites().
 * Depends on: @forge/core (ConfigSource, TraceSink). No IO of its own.
 */

import type { ConfigSource, TraceSink } from '@forge/core';

const emitSafely = (trace: TraceSink, entry: Parameters<TraceSink['emit']>[0]): void => {
  try {
    trace.emit(entry);
  } catch {
    // Tracing must never change a save's outcome.
  }
};

/** `config` whose saves are emitted to `trace`; behaviour is otherwise unchanged. */
export function traceConfigWrites(config: ConfigSource, trace: TraceSink): ConfigSource {
  return {
    company: () => config.company(),
    project: (slug) => config.project(slug),
    history: (scope, project) => config.history(scope, project),
    async append(input) {
      const subject = input.project === undefined ? {} : { project: input.project };
      try {
        const saved = await config.append(input);
        emitSafely(trace, {
          level: 'info',
          kind: 'config',
          ...subject,
          actor: 'owner',
          message: `config saved: ${input.scope}${input.project ? ` ${input.project}` : ''} v${saved.version}`,
          data: {
            scope: input.scope,
            author: input.author,
            reason: input.reason,
            doc: input.doc,
            version: saved.version,
          },
        });

        return saved;
      } catch (error) {
        emitSafely(trace, {
          level: 'warn',
          kind: 'config',
          ...subject,
          actor: 'owner',
          message: `config save rejected: ${input.scope}${input.project ? ` ${input.project}` : ''}`,
          data: {
            scope: input.scope,
            author: input.author,
            reason: input.reason,
            expectedVersion: input.expectedVersion,
            error: error instanceof Error ? error.message : String(error),
          },
        });

        throw error;
      }
    },
  };
}
