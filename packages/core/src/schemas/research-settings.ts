/**
 * Research settings — the company's web research provider and the project's narrowing of it.
 *
 * Why: where Forge searches and which hosts it may fetch is configuration the owner edits in the
 *   UI, not code or an environment variable (code.md rule 9, d-0085, d-0090). The company picks one
 *   provider and the host lists; a project may only narrow that (turn research off, refuse more
 *   hosts, limit the hosts it may reach), so no repository can send queries somewhere the company
 *   never allowed. A new provider adds a value here and a folder in the research package.
 *
 * Exports: ResearchProviderId, SearxngSettings, ResearchSettings, ProjectResearch, ResearchTestBody,
 *   ResearchTestReply, ResearchErrorKind, RESEARCH_ERROR_KINDS.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

export const ResearchProviderId = z.enum(['searxng', 'none']);
export type ResearchProviderId = z.infer<typeof ResearchProviderId>;

const Host = z.string().trim().min(1).max(253);

export const SearxngSettings = z.object({
  base_url: z.url({ protocol: /^https?$/ }),
  /** Extra non-loopback hosts the owner trusts as the SearXNG endpoint (exact host match). */
  allow_hosts: z.array(Host),
});
export type SearxngSettings = z.infer<typeof SearxngSettings>;

export const ResearchSettings = z.object({
  provider: ResearchProviderId,
  searxng: SearxngSettings,
  fetch: z.object({
    /** When non-empty, only these exact hosts may be fetched. */
    allow_hosts: z.array(Host),
    deny_hosts: z.array(Host),
    timeout_ms: z.number().int().min(1000).max(30_000),
  }),
});
export type ResearchSettings = z.infer<typeof ResearchSettings>;

/** A project's override: it can only narrow the company's settings. */
export const ProjectResearch = z.object({
  enabled: z.boolean().optional(),
  deny_hosts: z.array(Host).optional(),
  allow_hosts: z.array(Host).optional(),
});
export type ProjectResearch = z.infer<typeof ProjectResearch>;

/** `POST /settings/research/test`: test the saved settings, or unsaved ones. */
export const ResearchTestBody = z.object({ research: ResearchSettings.optional() });
export type ResearchTestBody = z.infer<typeof ResearchTestBody>;

export const RESEARCH_ERROR_KINDS = [
  'not_configured',
  'denied',
  'unreachable',
  'timeout',
  'too_large',
  'bad_content',
  'http_error',
] as const;
export const ResearchErrorKind = z.enum(RESEARCH_ERROR_KINDS);
export type ResearchErrorKind = z.infer<typeof ResearchErrorKind>;

export const ResearchTestReply = z.object({
  ok: z.boolean(),
  provider: ResearchProviderId,
  latency_ms: z.number().int().nonnegative().optional(),
  error: z.object({ kind: ResearchErrorKind, message: z.string() }).optional(),
});
export type ResearchTestReply = z.infer<typeof ResearchTestReply>;
