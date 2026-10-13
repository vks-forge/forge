/**
 * Shared fixtures for @forge/tools tests.
 *
 * Why: admit, grants and catalogue tests all need a realistic signed M0 catalogue and a
 * run context. Building them from the production loader and grant builder means the
 * tests exercise the same signature check and narrowing as a real run, and a schema or
 * lane-default change breaks the fixtures in one place.
 *
 * Exports: KEY, OTHER_KEY, HARNESS, ENTRIES, makeCtx(), signedYaml(), liveHashes(), call(), grant(), withEntry().
 * Depends on: yaml, @forge/core, domain/catalogue, domain/grants, shared/hmac. No IO.
 */

import type { Lane } from '@forge/core';
import { stringify } from 'yaml';
import type { z } from 'zod';
import { loadCatalogue, signCatalogue } from '#/domain/catalogue.js';
import { effectiveGrant } from '#/domain/grants.js';
import { Grant } from '#/schemas/grant.js';
import { sha256Hex } from '#/shared/hmac.js';
import type { AdmitCall, AdmitContext } from '#/types/admit.types.js';

export const KEY = 'test-catalogue-key-0123456789abcdef';
export const OTHER_KEY = 'other-catalogue-key-0123456789abcdef';
export const HARNESS = 'claude-code';

const hash = (id: string): string => `sha256:${sha256Hex(id)}`;

function entry(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  const native = id === 'shell' ? 'PowerShell' : id;

  return {
    id,
    kind: id.startsWith('mcp__') ? 'factory-capability' : 'harness-native',
    version: '1',
    risk: 'read',
    exposure: 'direct',
    schema_hash: hash(id),
    support: id.startsWith('mcp__')
      ? { '*': { mechanism: 'mcp', enforced: 'server' } }
      : { [HARNESS]: { native, mechanism: 'allow-flag', enforced: 'harness' } },
    ...over,
  };
}

const forge = (t: string, over: Record<string, unknown> = {}) =>
  entry(`mcp__forge__${t}`, over);

export const ENTRIES: Record<string, unknown>[] = [
  entry('read'),
  entry('grep'),
  entry('glob'),
  entry('edit', { risk: 'write-cwd', resources: ['cwd'] }),
  entry('write', { risk: 'write-cwd', resources: ['cwd'] }),
  entry('shell', { risk: 'exec', resources: ['cwd'] }),
  forge('get_ticket'),
  forge('add_comment'),
  forge('ask_director'),
  forge('report_blocked'),
  forge('finish'),
  forge('docs_lookup'),
  forge('code_graph'),
  forge('web_search', {
    risk: 'network',
    cost_class: 'metered',
    taints: true,
    exposure: 'deferred',
  }),
  forge('web_fetch', { risk: 'network', taints: true, exposure: 'deferred' }),
  forge('db_query_readonly', { risk: 'read' }),
  forge('memory_search'),
  forge('tool_search', { reaches_tools: ['mcp__forge__*', 'read'] }),
  entry('mcp__github__create_issue', { kind: 'project', risk: 'network' }),
];

export function signedYaml(entries: readonly unknown[] = ENTRIES, key = KEY): string {
  return stringify({ entries, signature: signCatalogue(entries, key) });
}

export function liveHashes(
  entries: Record<string, unknown>[] = ENTRIES,
): Record<string, string> {
  return Object.fromEntries(
    entries.map((e) => [e.id as string, e.schema_hash as string]),
  );
}

export function makeCtx(
  lane: Lane,
  over: Partial<AdmitContext> = {},
  grants: { project?: Grant; ticket?: Grant } = {},
  entries: Record<string, unknown>[] = ENTRIES,
): AdmitContext {
  return {
    lane,
    harness: HARNESS,
    catalogue: loadCatalogue(signedYaml(entries), KEY),
    grant: effectiveGrant(lane, grants.project, grants.ticket),
    liveSchemaHashes: liveHashes(entries),
    cwd: '/work/repo',
    ...over,
  };
}

export const call = (
  tool: string,
  input?: Record<string, unknown>,
  over: Partial<AdmitCall> = {},
): AdmitCall => ({
  phase: 'call',
  tool,
  ...(input ? { input } : {}),
  ...over,
});

/** ENTRIES with the fields of one tool overridden (hash and signature are recomputed by callers). */
export const withEntry = (
  id: string,
  over: Record<string, unknown>,
): Record<string, unknown>[] => ENTRIES.map((e) => (e.id === id ? { ...e, ...over } : e));

/** Builds a parsed Grant (defaults applied) from a partial literal. */
export const grant = (g: z.input<typeof Grant>): Grant => Grant.parse(g);
