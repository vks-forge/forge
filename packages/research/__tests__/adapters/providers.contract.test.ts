/**
 * Runs the research provider contract against every adapter.
 *
 * Why: one contract, every implementation (code.md rule 8): the SearXNG adapter (with fake ports) and the
 *   `none` adapter must both refuse what must never be fetched and never throw an outage into the caller.
 *
 * Pins: describeResearchContract for searxng and none.
 * Depends on: tests/contract/research-provider.contract, tests/helpers/fake-network, src/index.
 */

import { createResearchProvider } from '#/index.js';
import { describeResearchContract } from '#tests/contract/research-provider.contract.js';
import { SETTINGS, fakeNet } from '#tests/helpers/fake-network.js';

describeResearchContract('searxng', () => createResearchProvider(SETTINGS, fakeNet()), 'searxng');

describeResearchContract(
  'none',
  () => createResearchProvider({ ...SETTINGS, provider: 'none' }, fakeNet()),
  'none',
);
