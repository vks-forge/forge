/**
 * None research provider — research switched off.
 *
 * Why: a project or company can run with no web research at all (provider `none`, or research disabled for
 *   a project). The engine and the MCP tools must still behave: the research step finishes with a note and
 *   the plan's outside claims stay unverified, so the owner decides (d-0144, d-0135 no dead ends). This
 *   provider declares no capability and answers every call with `not_configured` in plain words; it never
 *   touches the network and needs no ports.
 *
 * Exports: createNoneProvider(), NOT_CONFIGURED_MESSAGE.
 * Depends on: @forge/core. No IO.
 */

import { err } from '@forge/core';
import type { ResearchProvider } from '@forge/core';
import { researchError } from '#/shared/research-errors.js';

export const NOT_CONFIGURED_MESSAGE =
  'Research is off: no search provider is set. Choose one in Forge settings, Research.';

const off = () => err(researchError('not_configured', NOT_CONFIGURED_MESSAGE));

export function createNoneProvider(): ResearchProvider {
  return {
    capabilities: () => ({
      provider: 'none',
      search: false,
      fetch: false,
      reportsCost: false,
    }),
    search: async () => off(),
    fetch: async () => off(),
    health: async () => off(),
  };
}
