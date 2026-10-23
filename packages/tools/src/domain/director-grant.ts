/**
 * Director grant — the read-only tool set the Director's planning steps get, confined to the project root.
 *
 * Why: before it plans a card the Director reads the repo (a file, a text search, a path
 *   pattern), and the paths and patterns are written by a model. Unlike a Worker, the
 *   Director runs engine-side with no sandbox around it, so one slipped `../secret`, an
 *   absolute path outside the project, a credential file or a write tool would reach the
 *   host. This module is the policy for those reads: it builds a dedicated catalogue
 *   (read, grep, glob only) and a dedicated grant (Express lane, so an `ask` is a deny
 *   because nobody can answer; floors for credentials, outside-the-root and harness config)
 *   and asks the one `admit()` door, so the Director has no policy path of its own. Any
 *   input it cannot judge, and any error, is a `deny`.
 *
 * Exports: DIRECTOR_TOOL_IDS, DIRECTOR_HARNESS, admitDirectorRead(), admitDirectorTool().
 * Depends on: domain/admit, domain/catalogue, domain/floors, domain/data-home-floor,
 *   shared/path, schemas/decision, types/grants, types/admit, @forge/core (ReadRequest). No IO.
 */

import type { ReadRequest } from '@forge/core';
import { admit } from '#/domain/admit.js';
import { loadCatalogue } from '#/domain/catalogue.js';
import { dataHomeKnown } from '#/domain/data-home-floor.js';
import { FLOOR_RULES } from '#/domain/floors.js';
import type { Decision } from '#/schemas/decision.js';
import { isInside } from '#/shared/path.js';
import type { AdmitContext } from '#/types/admit.types.js';
import type { EffectiveGrant } from '#/types/grants.types.js';

/** The only tools a planning step may use. */
export const DIRECTOR_TOOL_IDS = ['read', 'grep', 'glob'] as const;

/** Harness key of the director's catalogue entries; not a real harness, it only selects `support`. */
export const DIRECTOR_HARNESS = 'forge-director';

/** The director's tools are engine code, not a harness build's: their schema is fixed here, so the hash is a constant. */
const SCHEMA_HASH = `sha256:${'0'.repeat(64)}`;

const CATALOGUE = loadCatalogue({
  entries: DIRECTOR_TOOL_IDS.map((id) => ({
    id,
    kind: 'factory-core',
    version: '1',
    risk: 'read',
    exposure: 'direct',
    resources: ['cwd'],
    schema_hash: SCHEMA_HASH,
    support: {
      [DIRECTOR_HARNESS]: { mechanism: 'engine-read', enforced: 'server' },
    },
  })),
});

/**
 * Stand-in data home when the caller has none: the floor needs an absolute path or it
 * denies everything. This one is a top-level folder no project lives in, so it never
 * contains the root; a root inside a real data home is exempted by the floor itself.
 */
const SENTINEL_DATA_HOME =
  process.platform === 'win32' ? 'C:\\__forge_no_data_home__' : '/__forge_no_data_home__';

const CONTROL = /[\u0000-\u001f\u007f]/;
const DRIVE_ABSOLUTE = /^[a-zA-Z]:[\\/]/;
const ROOTED = /^[\\/](?![\\/])/;

function grantFor(dataHome: string): EffectiveGrant {
  return {
    lane: 'express',
    dataHome,
    ceiling: [...DIRECTOR_TOOL_IDS],
    projectMcpAllow: [],
    projectMcps: false,
    narrowing: [],
    deny: [],
    ruleLayers: [
      {
        name: 'director',
        rules: DIRECTOR_TOOL_IDS.map((action) => ({
          action,
          resource: '**',
          effect: 'allow' as const,
        })),
      },
    ],
    approved: [],
    managed: [...FLOOR_RULES],
  };
}

function denyDecision(tool: string, rule: string): Decision {
  return {
    decision: 'deny',
    reason: 'invalid_resource',
    enforced_by: 'forge_admit',
    enforcement: null,
    layer: 'floor',
    matched_rule: rule,
    finding_ids: [],
    tool,
  };
}

/** True when `value` is a path or glob that may be judged: relative, or absolute inside `root`. */
function usablePath(value: unknown, root: string): boolean {
  if (typeof value !== 'string' || value === '' || CONTROL.test(value)) {
    return false;
  }

  if (value.startsWith('~') || /^[\\/]{2}/.test(value)) {
    return false;
  }

  if (value.split(/[\\/]/).some((s) => /^\.\.[ .]*$/.test(s))) {
    return false;
  }

  if (DRIVE_ABSOLUTE.test(value) || ROOTED.test(value)) {
    return isInside(value, root);
  }

  // `C:x` is relative to a drive's current folder, which this check cannot know.
  return !/^[a-zA-Z]:/.test(value);
}

/** The tool-call inputs `admit()` is asked about for one request; `null` when the request itself is unusable. */
function callsFor(
  request: ReadRequest,
  root: string,
): { tool: string; input: Record<string, unknown> }[] | null {
  if (request === null || typeof request !== 'object') {
    return null;
  }

  if (request.op === 'read') {
    return usablePath(request.path, root)
      ? [{ tool: 'read', input: { file_path: request.path } }]
      : null;
  }

  if (request.op === 'glob') {
    return usablePath(request.pattern, root)
      ? [{ tool: 'glob', input: { pattern: request.pattern } }]
      : null;
  }

  if (request.op === 'grep') {
    // The grep pattern is a regular expression, not a path: only its shape is checked.
    if (
      typeof request.pattern !== 'string' ||
      request.pattern === '' ||
      CONTROL.test(request.pattern)
    ) {
      return null;
    }

    const calls = [{ tool: 'grep', input: { pattern: request.pattern, path: '.' } }];
    if (request.glob === undefined) {
      return calls;
    }

    return usablePath(request.glob, root)
      ? [...calls, { tool: 'glob', input: { pattern: request.glob } }]
      : null;
  }

  return null;
}

function admitAll(
  calls: readonly { tool: string; input: Readonly<Record<string, unknown>> }[],
  root: string,
  dataHome: string | undefined,
  label: string,
): Decision {
  const ctx: AdmitContext = {
    lane: 'express',
    harness: DIRECTOR_HARNESS,
    catalogue: CATALOGUE,
    grant: grantFor(dataHome ?? SENTINEL_DATA_HOME),
    liveSchemaHashes: Object.fromEntries(
      DIRECTOR_TOOL_IDS.map((id) => [id, SCHEMA_HASH]),
    ),
    cwd: root,
  };

  let last: Decision | undefined;
  for (const c of calls) {
    last = admit(ctx, { phase: 'call', tool: c.tool, input: c.input });
    if (last.decision !== 'allow') {
      return { ...last, tool: label };
    }
  }

  return last ? { ...last, tool: label } : denyDecision(label, 'director:no-call');
}

function rootUsable(root: unknown): root is string {
  return typeof root === 'string' && dataHomeKnown(root) && !CONTROL.test(root);
}

/**
 * Judges one engine-side planning read. `allow` only when every path resource of the
 * request resolves inside `root` and no floor denies it. Never throws: any error becomes a
 * deny Decision.
 */
export function admitDirectorRead(
  request: ReadRequest,
  root: string,
  dataHome?: string,
): Decision {
  const label = typeof request?.op === 'string' ? request.op : 'unknown';
  try {
    if (!rootUsable(root)) {
      return denyDecision(label, 'director:root');
    }

    const calls = callsFor(request, root);

    return calls
      ? admitAll(calls, root, dataHome, label)
      : denyDecision(label, 'director:input');
  } catch {
    return denyDecision(label, 'director:error');
  }
}

/**
 * The same door for any tool id and input. Only `read`, `grep` and `glob` exist in the
 * director's catalogue, so write, edit, shell, web and MCP ids are refused as unknown.
 */
export function admitDirectorTool(
  tool: string,
  input: Readonly<Record<string, unknown>>,
  root: string,
  dataHome?: string,
): Decision {
  const label = typeof tool === 'string' ? tool : 'unknown';
  try {
    if (!rootUsable(root)) {
      return denyDecision(label, 'director:root');
    }

    return admitAll([{ tool, input }], root, dataHome, label);
  } catch {
    return denyDecision(label, 'director:error');
  }
}
