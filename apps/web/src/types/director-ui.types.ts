/**
 * Shapes of the Director settings screens.
 *
 * Why: the flow editor, the model rows and the locked-rules list share a few small shapes
 *   (a validation message tied to a step, whether a step may move and why not, a locked rule
 *   with its reason). Naming them once keeps the pure rules in `domain/` and the components
 *   in step.
 *
 * Exports: FlowIssue, StepAction, WhenKind, LockedRule, StepInfo, DirectorKey,
 *   DirectorOverrideValue, DirectorRow, OverridableKey, SignOffTier.
 * Depends on: @forge/core (types). Types only.
 */

import type { DirectorConfig } from '@forge/core';

/** One thing wrong with the flow; `stepId` is set when a single step is at fault. */
export interface FlowIssue {
  readonly stepId?: string;
  readonly message: string;
}

/** Whether a step may move in a direction; `reason` says why not. */
export type StepAction =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** The three ways a step's `when` reads in the editor. */
export type WhenKind = 'always' | 'lanes' | 'director_decides';

/** A rule the owner cannot change, with the reason shown beside it. */
export interface LockedRule {
  readonly id: string;
  readonly title: string;
  readonly reason: string;
}

/** A Director step as the owner knows it. */
export interface StepInfo {
  readonly label: string;
  readonly hint: string;
}

/** The sections of the `director` settings. */
export type DirectorKey = keyof DirectorConfig;

/** A project's partial Director settings: a key is present exactly when the project overrides it. */
export type DirectorOverrideValue = Partial<DirectorConfig>;

/** One overridable Director setting on the project page. */
export interface DirectorRow {
  readonly key: OverridableKey;
  readonly label: string;
  readonly hint: string;
  /** The company value in words. */
  readonly words: (d: DirectorConfig) => string;
}

/** How far the Director may sign finished work: `none`, tier A or tier B (tier C is always the owner's). */
export type SignOffTier = DirectorConfig['sign_off']['max_tier'];

/** The sections a project may override on its own (playbooks and the step limit, one count for the whole engine, stay company-wide). */
export type OverridableKey = Exclude<DirectorKey, 'playbooks' | 'max_concurrent_steps'>;
