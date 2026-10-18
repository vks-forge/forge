/**
 * Effective research settings — the company's settings narrowed by a project.
 *
 * Why: the company decides which provider and hosts research may use; a project may only narrow that
 *   (turn research off, refuse more hosts, limit the hosts it may reach). A project can never widen it,
 *   or one repository's settings could send queries and fetches where the company never allowed. An
 *   empty allow list means "any public host" to the fetcher, so an allow list that narrowed to nothing
 *   must switch research off rather than quietly become "any".
 *
 * Exports: effectiveResearch().
 * Depends on: schemas/research-settings, types/research-settings. No IO.
 */

import type { ProjectResearch, ResearchSettings } from '#/schemas/research-settings.js';
import type { EffectiveResearch } from '#/types/research-settings.types.js';

const lower = (hosts: readonly string[] | undefined): string[] => [
  ...new Set((hosts ?? []).map((h) => h.trim().toLowerCase())),
];

/** The company settings with the project's narrowing laid over them. */
export function effectiveResearch(
  company: ResearchSettings,
  project?: ProjectResearch,
): EffectiveResearch {
  const companyAllow = lower(company.fetch.allow_hosts);
  const projectAllow = lower(project?.allow_hosts);

  let allowHosts = companyAllow;
  if (projectAllow.length > 0) {
    allowHosts =
      companyAllow.length > 0
        ? projectAllow.filter((h) => companyAllow.includes(h))
        : projectAllow;
  }

  const narrowedToNothing = companyAllow.length > 0 && allowHosts.length === 0;
  const enabled =
    company.provider !== 'none' && project?.enabled !== false && !narrowedToNothing;

  return {
    enabled,
    provider: company.provider,
    allowHosts,
    denyHosts: lower([...company.fetch.deny_hosts, ...(project?.deny_hosts ?? [])]),
  };
}
