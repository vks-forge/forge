/**
 * The owner's side of the Director's pipeline proposals: list, accept, reject.
 *
 * Why: the Director never edits a project's lane list (d-0151, d-0019): it records a proposal when it keeps making
 *   the same change, and only the owner decides it. Accepting is an ordinary lane save, so it goes through the
 *   one door for pipeline config (the pipeline store's `saveProject`: the rules, the version the editor saw, one
 *   append authored by the owner with the reason "Accepted Director proposal #n"), never around it. A proposal
 *   is only valid for the list it was made against: if the lane's current hash is no longer the proposal's base,
 *   the owner already changed the lane, so the proposal is marked `stale` and nothing is written (409). A
 *   rejection needs a reason and, because the proposal row stays, suppresses the same change for that base for
 *   good. These two methods are the only writers of a decided proposal.
 *
 * Exports: createProposalDoors().
 * Depends on: @forge/core (pipelineHash, effectivePipelines, proposal schemas), services/{agent-state,find-project},
 *   services/http/http-errors, types/pipeline-store. IO: reads and writes storage, through the pipeline store for config.
 */

import { effectivePipelines, pipelineHash } from '@forge/core';
import type {
  Lane,
  PipelineDefinition,
  PipelineProposal,
  PipelineProposalView,
  ProjectPipelines,
  ProposalStatus,
} from '@forge/core';
import { findProject } from '#/services/find-project.js';
import { HttpError } from '#/services/http/http-errors.js';
import type { AgentDeps, AgentState } from '#/types/agent-store.types.js';
import type { PipelineStore, ProposalDoors } from '#/types/pipeline-store.types.js';

const EMPTY: ProjectPipelines = { routing: [] };
const REASON_MAX = 500;

const notFound = (raw: string): HttpError =>
  new HttpError(404, 'proposal_not_found', `no pipeline proposal ${raw}`);

export function createProposalDoors(
  deps: AgentDeps,
  state: AgentState,
  save: PipelineStore['saveProject'],
): ProposalDoors {
  const nowIso = (): string => new Date(deps.now()).toISOString();

  /** The lane list the project runs now (its own over the company's over the shipped one). */
  async function laneNow(slug: string, lane: Lane): Promise<PipelineDefinition> {
    const at = await state.read({ scope: 'project', slug });
    const own = (await deps.config.project(slug)).config.project.pipelines ?? EMPTY;

    return effectivePipelines(at.forge.pipelines, own, at.views)[lane].definition;
  }

  /** The proposal `raw` of project `slug`, or 404 (a proposal of another project is not found either). */
  async function load(slug: string, raw: string): Promise<PipelineProposal> {
    const id = /^[1-9][0-9]*$/.test(raw) ? Number(raw) : null;
    const found = await deps.storage.transaction(async (tx) => {
      await findProject(tx, slug);

      return id === null ? null : await tx.pipelineProposals.get(id);
    });

    if (!found || found.project !== slug) {
      throw notFound(raw);
    }

    return found;
  }

  const view = (
    p: PipelineProposal,
    current: PipelineDefinition,
  ): PipelineProposalView => ({
    ...p,
    current,
    stale:
      p.status === 'stale' ||
      (p.status === 'pending' && pipelineHash(current) !== p.base_hash),
  });

  return {
    async proposals(slug, status) {
      const list = await deps.storage.transaction(async (tx) => {
        await findProject(tx, slug);

        return tx.pipelineProposals.list(
          slug,
          status === 'pending' ? 'pending' : undefined,
        );
      });

      const current = new Map<Lane, PipelineDefinition>();
      const out: PipelineProposalView[] = [];
      for (const p of list) {
        if (!current.has(p.lane)) {
          current.set(p.lane, await laneNow(slug, p.lane));
        }

        out.push(view(p, current.get(p.lane) as PipelineDefinition));
      }

      return out;
    },

    async acceptProposal(slug, raw, body) {
      const proposal = await load(slug, raw);
      if (proposal.status !== 'pending') {
        throw new HttpError(
          409,
          'not_pending',
          `proposal ${raw} is already ${proposal.status}`,
        );
      }

      if (pipelineHash(await laneNow(slug, proposal.lane)) !== proposal.base_hash) {
        await deps.storage.transaction((tx) =>
          tx.pipelineProposals.decide(proposal.id, {
            status: 'stale',
            reason: 'The lane changed since this was proposed; nothing was applied.',
            at: nowIso(),
          }),
        );

        throw new HttpError(
          409,
          'proposal_stale',
          'The lane changed since the Director proposed this; nothing was applied.',
        );
      }

      const note = body.reason?.trim();
      const reason =
        `Accepted Director proposal #${proposal.id}${note ? `: ${note}` : ''}`.slice(
          0,
          REASON_MAX,
        );

      // The one config door: the rules, the version the owner saw and one owner-authored append.
      const pipelines = await save(slug, proposal.lane, {
        pipeline: proposal.proposed,
        expected_version: body.expected_version,
        reason,
      });

      const decided = await deps.storage.transaction(async (tx) => {
        const won = await tx.pipelineProposals.decide(proposal.id, {
          status: 'accepted',
          ...(note ? { reason: note } : {}),
          config_version: `c${pipelines.version.company}:p${pipelines.version.project}`,
          at: nowIso(),
        });

        return won ? await tx.pipelineProposals.get(proposal.id) : null;
      });

      if (!decided) {
        throw new HttpError(409, 'not_pending', `proposal ${raw} was decided meanwhile`);
      }

      return { proposal: decided, pipelines };
    },

    async rejectProposal(slug, raw, body) {
      const proposal = await load(slug, raw);
      if (proposal.status !== 'pending') {
        throw new HttpError(
          409,
          'not_pending',
          `proposal ${raw} is already ${proposal.status as ProposalStatus}`,
        );
      }

      const decided = await deps.storage.transaction(async (tx) => {
        const won = await tx.pipelineProposals.decide(proposal.id, {
          status: 'rejected',
          reason: body.reason,
          at: nowIso(),
        });

        return won ? await tx.pipelineProposals.get(proposal.id) : null;
      });

      if (!decided) {
        throw new HttpError(409, 'not_pending', `proposal ${raw} was decided meanwhile`);
      }

      return { proposal: decided };
    },
  };
}
