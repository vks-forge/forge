/**
 * Research grant — the web tools the Director's research step may use, judged by admit().
 *
 * Why: the research step is a model that has just read pages written by strangers, and what it asks for
 *   next (a search, a URL to fetch) leaves the machine. A `file:` URL, an address with a password in it,
 *   a private or loopback address or a host the owner banned must never reach the network layer. This is
 *   the Director's policy path for outside facts (d-0131, d-0144): a dedicated catalogue (`web_search`,
 *   `web_fetch` only) and a dedicated grant (Express lane, so an `ask` is a deny because nobody can
 *   answer) asked through the one `admit()` door, with the shape checks first. Any input it cannot judge,
 *   and any error, is a `deny`. The fetcher's DNS-pinned guard is a second, independent line.
 *
 * Exports: RESEARCH_TOOL_IDS, admitResearch().
 * Depends on: domain/admit, domain/catalogue, domain/floors, domain/ip-literal, domain/director-grant (DIRECTOR_HARNESS),
 *   schemas/decision, types/grants, types/admit, @forge/core (ResearchRequest). No IO.
 */

import type { ResearchRequest } from '@forge/core';
import { admit } from '#/domain/admit.js';
import { loadCatalogue } from '#/domain/catalogue.js';
import { DIRECTOR_HARNESS } from '#/domain/director-grant.js';
import { FLOOR_RULES } from '#/domain/floors.js';
import { isPrivateLiteral } from '#/domain/ip-literal.js';
import type { Decision } from '#/schemas/decision.js';
import type { CallRule } from '#/schemas/grant.js';
import type { AdmitContext } from '#/types/admit.types.js';
import type { ResearchLimits } from '#/types/research-limits.types.js';
import type { EffectiveGrant } from '#/types/grants.types.js';

/** The only tools a research step may use. */
export const RESEARCH_TOOL_IDS = ['web_search', 'web_fetch'] as const;

const SCHEMA_HASH = `sha256:${'0'.repeat(64)}`;
const SENTINEL_DATA_HOME =
  process.platform === 'win32' ? 'C:\\__forge_no_data_home__' : '/__forge_no_data_home__';

const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_QUERY = 200;
const MAX_URL = 2000;

const CATALOGUE = loadCatalogue({
  entries: RESEARCH_TOOL_IDS.map((id) => ({
    id,
    kind: 'factory-core',
    version: '1',
    risk: 'network',
    exposure: 'direct',
    resources: [],
    schema_hash: SCHEMA_HASH,
    support: { [DIRECTOR_HARNESS]: { mechanism: 'engine-web', enforced: 'server' } },
  })),
});

const rule = (
  action: string,
  resource: string,
  effect: CallRule['effect'],
): CallRule => ({
  action,
  resource,
  effect,
});

/** Managed deny rules for a banned host: the host itself and every subdomain, any scheme or port. */
function denyRules(host: string): CallRule[] {
  return ['http', 'https'].flatMap((scheme) => [
    rule('web_fetch', `${scheme}://${host}`, 'deny'),
    rule('web_fetch', `${scheme}://${host}/*`, 'deny'),
    rule('web_fetch', `${scheme}://${host}:*`, 'deny'),
    rule('web_fetch', `${scheme}://*.${host}`, 'deny'),
    rule('web_fetch', `${scheme}://*.${host}/*`, 'deny'),
    rule('web_fetch', `${scheme}://*.${host}:*`, 'deny'),
  ]);
}

function grantFor(limits: ResearchLimits): EffectiveGrant {
  return {
    lane: 'express',
    dataHome: SENTINEL_DATA_HOME,
    ceiling: [...RESEARCH_TOOL_IDS],
    projectMcpAllow: [],
    projectMcps: false,
    narrowing: [],
    deny: [],
    ruleLayers: [
      {
        name: 'research',
        rules: [
          rule('web_search', '*', 'allow'),
          rule('web_fetch', 'http://*', 'allow'),
          rule('web_fetch', 'https://*', 'allow'),
        ],
      },
    ],
    managed: [
      ...FLOOR_RULES,
      ...limits.denyHosts.flatMap((h) => denyRules(h.toLowerCase())),
    ],
  };
}

function denyDecision(tool: string, rule_: string): Decision {
  return {
    decision: 'deny',
    reason: 'invalid_resource',
    enforced_by: 'forge_admit',
    enforcement: null,
    layer: 'floor',
    matched_rule: rule_,
    finding_ids: [],
    tool,
  };
}

const bare = (host: string): string => host.replace(/^\[|\]$/g, '').toLowerCase();

const hostIn = (host: string, list: readonly string[]): boolean =>
  list.some((h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`));

/** The normalised URL when `raw` is a usable public http(s) URL under `limits`; otherwise the rule that refused it. */
function checkUrl(
  raw: unknown,
  limits: ResearchLimits,
): { url: string } | { refused: string } {
  if (
    typeof raw !== 'string' ||
    raw === '' ||
    raw.length > MAX_URL ||
    CONTROL.test(raw)
  ) {
    return { refused: 'research:url' };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { refused: 'research:url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { refused: 'research:scheme' };
  }

  if (url.username !== '' || url.password !== '') {
    return { refused: 'research:userinfo' };
  }

  const host = bare(url.hostname);
  if (host === '' || host === 'localhost' || host.endsWith('.localhost')) {
    return { refused: 'research:loopback' };
  }

  if (isPrivateLiteral(host)) {
    return { refused: 'research:private-address' };
  }

  if (hostIn(host, limits.denyHosts)) {
    return { refused: 'research:deny-host' };
  }

  if (
    limits.allowHosts.length > 0 &&
    !limits.allowHosts.some((h) => h.toLowerCase() === host)
  ) {
    return { refused: 'research:not-allowed-host' };
  }

  return { url: url.href };
}

function run(request: ResearchRequest, limits: ResearchLimits): Decision {
  if (request === null || typeof request !== 'object') {
    return denyDecision('unknown', 'research:input');
  }

  let tool: string;
  let input: Record<string, unknown>;
  if (request.op === 'search') {
    const q = request.query;
    if (
      typeof q !== 'string' ||
      q.trim() === '' ||
      q.length > MAX_QUERY ||
      CONTROL.test(q)
    ) {
      return denyDecision('web_search', 'research:query');
    }

    tool = 'web_search';
    input = { query: q };
  } else if (request.op === 'fetch') {
    const checked = checkUrl(request.url, limits);
    if ('refused' in checked) {
      return denyDecision('web_fetch', checked.refused);
    }

    tool = 'web_fetch';
    input = { url: checked.url };
  } else {
    return denyDecision('unknown', 'research:input');
  }

  const ctx: AdmitContext = {
    lane: 'express',
    harness: DIRECTOR_HARNESS,
    catalogue: CATALOGUE,
    grant: grantFor(limits),
    liveSchemaHashes: Object.fromEntries(
      RESEARCH_TOOL_IDS.map((id) => [id, SCHEMA_HASH]),
    ),
  };

  return admit(ctx, { phase: 'call', tool, input });
}

/**
 * Judges one research request (a search or a fetch). `allow` only when the shape checks pass and
 * `admit()` allows under the research grant. Never throws: any error becomes a deny Decision.
 */
export function admitResearch(
  request: ResearchRequest,
  limits: ResearchLimits,
): Decision {
  try {
    return run(request, limits);
  } catch {
    return denyDecision('unknown', 'research:error');
  }
}
