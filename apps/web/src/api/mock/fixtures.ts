/**
 * Seeded fixtures for the mock adapter.
 *
 * Why: screens whose server endpoint is not built yet still need data to be designed and
 *   tested against, and the loading, empty and error states only exist if something can be
 *   slow, empty or broken on demand. Everything here is plainly a sample (slugs start with
 *   `sample-`, no paths, no repositories) so a fixture can never be mistaken for the
 *   user's real work; the sidebar also shows a "Fixture data" mark while any resource is
 *   served from here. Rows are parsed with the real schema so a fixture cannot drift from it.
 *
 * Exports: projectFixtures.
 * Depends on: schemas/projects.
 */

import { ProjectView } from '#/schemas/projects.js';

export const projectFixtures = [
  {
    id: 'fixture-1',
    slug: 'sample-service',
    prefix: 'SVC',
    status: 'ready',
    ecosystems: ['node'],
  },
  {
    id: 'fixture-2',
    slug: 'sample-web',
    prefix: 'WEB',
    status: 'ready',
    ecosystems: ['node'],
  },
  {
    id: 'fixture-3',
    slug: 'sample-docs',
    prefix: 'DOC',
    status: 'onboarding',
    ecosystems: [],
  },
  {
    id: 'fixture-4',
    slug: 'sample-legacy',
    prefix: 'OLD',
    status: 'archived',
    ecosystems: [],
  },
].map((row) => ProjectView.parse(row));
