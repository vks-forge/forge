/**
 * The pipelines resource of the ForgeApi port, and the list shape its screens use.
 *
 * Why: lane pipelines are read and written from two screens (Forge settings for the company
 *   defaults, a project's settings for its own lists and routing rules) with the same verbs, and
 *   a ticket page reads its own copy. Naming the calls once, by scope, lets the http adapter,
 *   the hooks and the tests agree on them and keeps every path in the adapter. Every write names
 *   the scope version the editor saw and a reason; a stale version is refused with 409
 *   `version_conflict`, and an error keeps the server's `code` and its `problems` so the screen
 *   can say why in words.
 *
 * Exports: PipelineScope, PipelineLaneView, PipelineList, PipelineWriteMeta, SavePipelineBody,
 *   SaveRoutingBody, ValidateBody, ValidateResult, PipelinesApi.
 * Depends on: @forge/core (types only), types/api.types (types only).
 */

import type {
  Lane,
  PipelineDefinition,
  PipelineProblem,
  PipelineView,
  RoutingRule,
  StageArtifact,
  TicketPipelineView,
} from '@forge/core';
import type { RequestOptions } from '#/types/api.types.js';

/** Where a screen reads and writes pipelines. */
export type PipelineScope =
  { readonly kind: 'company' } | { readonly kind: 'project'; readonly slug: string };

/** One lane as a screen shows it; `changed` is set on project screens only. */
export interface PipelineLaneView extends PipelineView {
  readonly changed?: boolean;
}

/** One scope's three lanes (and a project's routing rules) with the version a write must name. */
export interface PipelineList {
  readonly lanes: Readonly<Record<Lane, PipelineLaneView>>;
  /** Project routing rules; always empty for the company scope. */
  readonly routing: readonly RoutingRule[];
  /** The scope's own version: the company's, or the project's. */
  readonly version: number;
  readonly companyVersion: number;
}

/** What every write carries: the scope version the editor saw, and why. */
export interface PipelineWriteMeta {
  readonly expected_version: number;
  readonly reason: string;
}

export interface SavePipelineBody extends PipelineWriteMeta {
  readonly pipeline: PipelineDefinition;
}

export interface SaveRoutingBody extends PipelineWriteMeta {
  readonly rules: readonly RoutingRule[];
}

export interface ValidateBody {
  readonly lane: Lane;
  readonly pipeline: PipelineDefinition;
  /** A project slug: validate against that project's roster. */
  readonly project?: string | undefined;
}

export interface ValidateResult {
  readonly problems: readonly PipelineProblem[];
  readonly warnings: readonly string[];
}

export interface PipelinesApi {
  list(scope: PipelineScope, options?: RequestOptions): Promise<PipelineList>;
  save(scope: PipelineScope, lane: Lane, body: SavePipelineBody): Promise<PipelineList>;
  reset(scope: PipelineScope, lane: Lane, meta: PipelineWriteMeta): Promise<PipelineList>;
  saveRouting(slug: string, body: SaveRoutingBody): Promise<PipelineList>;
  validate(body: ValidateBody, options?: RequestOptions): Promise<ValidateResult>;
  /** `null` before the ticket's first dispatch. */
  ticket(id: string, options?: RequestOptions): Promise<TicketPipelineView | null>;
  artifact(
    ticketId: string,
    artifactId: number,
    options?: RequestOptions,
  ): Promise<StageArtifact>;
}
