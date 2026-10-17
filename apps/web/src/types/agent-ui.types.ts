/**
 * Shapes shared by the agent screens: scope, list, editor form and action requests.
 *
 * Why: the company page and each project's page run the same list and the same editor over
 *   two different scopes (a company agent, a project's own agent, a project's override of a
 *   company agent). Naming the scope, the editable form and the list the screens pass around
 *   once keeps the two pages thin and lets the pure form helpers and the hooks agree on them.
 *   The form keeps the budget as text so a half-typed "0." is not rewritten under the cursor.
 *
 * Exports: AgentScope, AgentList, AgentWriteResult, AgentForm, BudgetText, FormIssue,
 *   VersionedAgents, AgentAction, RowAction, AgentSeed, EditorTarget, WorkspaceView, DraftNote, ToolOption, AgentSectionProps.
 * Depends on: schemas/agents (types only).
 */

import type { AgentRole, AgentView, ArtifactKind, RunsOn } from '#/schemas/agents.js';

/** Where a screen reads and writes agents. */
export type AgentScope =
  { readonly kind: 'company' } | { readonly kind: 'project'; readonly slug: string };

/** One scope's agents with the version a write must name. */
export interface AgentList {
  readonly agents: readonly AgentView[];
  /** The scope's own version: the company's, or the project's. */
  readonly version: number;
  /** The company version, for copying into the company from a project screen. */
  readonly companyVersion: number;
}

/** A scope's answer before it is reduced: the company's version is a number, a project's a pair. */
export interface VersionedAgents {
  readonly agents: readonly AgentView[];
  readonly version: number | { readonly company: number; readonly project: number };
}

export interface AgentWriteResult extends AgentList {
  /** Set by create and duplicate. */
  readonly id?: string;
}

/** Budget limits as typed; blank means "use the Forge default". */
export interface BudgetText {
  readonly usd: string;
  readonly minutes: string;
  readonly turns: string;
}

/** The editable agent, with every list and the budget in the shape a form control needs. */
export interface AgentForm {
  readonly name: string;
  readonly description: string;
  readonly role: AgentRole;
  readonly instructions: string;
  readonly runs_on: RunsOn;
  readonly tools: 'lane_default' | readonly string[];
  readonly write_scope: readonly string[];
  readonly inputs: readonly ArtifactKind[];
  readonly output: readonly ArtifactKind[];
  readonly skills: readonly string[];
  readonly memory: {
    readonly tags: readonly string[];
    readonly include_rejected: boolean;
  };
  readonly budget: BudgetText;
}

/** A problem with one field, in words an owner can act on. */
export interface FormIssue {
  /** Dotted path such as `name`, `tools` or `runs_on.fallbacks.0`. */
  readonly path: string;
  readonly message: string;
}

/** The state changes a list row can ask for; a project's "reset" is `reset-override`. */
export type AgentAction = 'reset' | 'archive' | 'unarchive' | 'disable' | 'enable';

/** Everything a row can ask for: open the editor, copy, or one of the state changes. */
export type RowAction = 'edit' | 'duplicate' | AgentAction;

/** A prefilled new agent: from scratch, a template, a copy or the Director's draft. */
export interface AgentSeed {
  readonly form: AgentForm;
  readonly origin: string;
}

/** What the Director said about its draft: shown above the editor until Save. */
export interface DraftNote {
  readonly rationale: string;
  readonly questions: readonly string[];
}

/** The editor opens on an existing agent or on a seed. */
export type EditorTarget =
  | { readonly kind: 'edit'; readonly id: string; readonly saved?: string }
  | { readonly kind: 'new'; readonly seed: AgentSeed; readonly note?: DraftNote };

export type WorkspaceView = { readonly kind: 'list' } | EditorTarget;

/** What every editor section that edits a part of the form receives. */
export interface AgentSectionProps {
  readonly form: AgentForm;
  readonly issues: readonly FormIssue[];
  readonly disabled: boolean;
  readonly onChange: (next: AgentForm) => void;
}

/** One checkbox of the tools list. */
export interface ToolOption {
  readonly id: string;
  readonly label: string;
  /** Declared risk class from the catalogue, when known. */
  readonly risk: string | undefined;
  /** Changes files or runs code: refused for a reviewer or researcher. */
  readonly writes: boolean;
}

/** Re-exported so editor sections name one view type. */
export type { AgentView };
