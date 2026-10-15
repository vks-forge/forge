/**
 * Test data: the projects the stubbed Forge server lists.
 *
 * Why: the shell, switcher and every project screen need a few projects in different states
 *   (ready, onboarding, archived) to be exercised. Everything here is plainly sample data
 *   (slugs start with `sample-`, no paths, no repositories). Rows are parsed with the real
 *   schema, so a drift between the server's shape and this data fails loudly at import.
 *
 * Exports: projectData.
 * Depends on: schemas/projects.
 */

import { ProjectView } from '#/schemas/projects.js';

export const projectData = [
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
