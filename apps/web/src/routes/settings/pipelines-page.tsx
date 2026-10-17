/**
 * Forge settings, Pipelines: the company's default stage list for each lane.
 *
 * Why: how much process a ticket gets used to be fixed in code: one Worker, then the gates. The
 *   owner now says it per lane: Express stays a Worker and the gate, Standard writes the failing
 *   tests first and adds an independent review, Full adds a critic and the owner's own
 *   sign-off. These are the defaults every project follows until it changes a lane for itself
 *   (see the project's Pipelines tab). Each save is a numbered version of the company settings,
 *   and tickets already started keep the pipeline they began with.
 *
 * Exports: PipelinesPage.
 * Depends on: components/pipelines/pipelines-workspace.
 */

import { PipelinesWorkspace } from '#/components/pipelines/pipelines-workspace.js';

const COMPANY = { kind: 'company' } as const;

export function PipelinesPage() {
  return <PipelinesWorkspace scope={COMPANY} />;
}
