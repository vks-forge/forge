/**
 * Shapes of the Plan tab: the dependency graph layout, version diff rows and ticket edit drafts.
 *
 * Why: the Plan tab derives several views from one stored plan (a graph, a diff against the
 *   previous version, a set of light edits). Naming the derived shapes keeps the pure functions
 *   that build them (domain/plan-graph, plan-diff, plan-edit) apart from the components that
 *   draw them, so each is testable without a browser.
 *
 * Exports: GraphNode, GraphEdge, GraphLayout, GraphMetrics, DiffRow, DraftTicket, PlanEditBody,
 *   PlanDialog, PlanDecisions, GraphInput.
 * Depends on: schemas/plan (types). Types only.
 */

import type { PlanPriority, PlanTicket } from '#/schemas/plan.js';

/** What the layout reads of a planned ticket. */
export type GraphInput = Pick<PlanTicket, 'key' | 'depends_on'>;

export interface GraphMetrics {
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  readonly gapX: number;
  readonly gapY: number;
}

export interface GraphNode {
  readonly key: string;
  /** 0 for a ticket that depends on nothing; one more than its deepest dependency otherwise. */
  readonly depth: number;
  readonly x: number;
  readonly y: number;
}

export interface GraphEdge {
  /** The dependency (drawn on the left)... */
  readonly from: string;
  /** ...and the ticket that waits for it. */
  readonly to: string;
}

export interface GraphLayout {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly width: number;
  readonly height: number;
}

/** One difference between two plan versions, in words; a null side means absent. */
export interface DiffRow {
  readonly field: string;
  readonly before: string | null;
  readonly after: string | null;
}

/** A ticket as the owner is editing it: the fields the server lets them change. */
export interface DraftTicket {
  readonly key: string;
  readonly title: string;
  readonly priority: PlanPriority;
  readonly removed: boolean;
  /** Positions of the Director's pipeline ops the owner took off this ticket (they may drop an op, never add one). */
  readonly dropOps: readonly number[];
}

/** The `PATCH /cards/:id/plan/:version/tickets` body. */
export interface PlanEditBody {
  readonly tickets: readonly {
    readonly key: string;
    readonly title?: string;
    readonly priority?: PlanPriority;
    readonly removed?: boolean;
    readonly drop_pipeline_ops?: readonly number[];
  }[];
  readonly order?: readonly string[];
}

export type PlanDialog = 'approve' | 'changes' | null;

/**
 * The owner's decisions on a ready plan, held at the Card page so the Plan tab buttons and the
 * Needs you banner open the same dialogs and show the same refusal.
 */
export interface PlanDecisions {
  readonly dialog: PlanDialog;
  readonly open: (dialog: Exclude<PlanDialog, null>) => void;
  readonly close: () => void;
  readonly approve: (version: number) => void;
  readonly requestChanges: (version: number, comment: string) => void;
  readonly pending: boolean;
  /** Why the last decision was refused, in words; null when it was not. */
  readonly error: string | null;
}
