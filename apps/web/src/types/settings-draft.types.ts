/**
 * Shape returned by the company-settings draft hook.
 *
 * Why: Limits and General edit the same versioned document with the same save, conflict and
 *   reload behaviour; one named shape keeps their screens and the save panel in step.
 *
 * Exports: CompanyDraft.
 * Depends on: @forge/core (types), schemas/settings (types), types/settings-fields.types,
 *   types/state.types. Types only.
 */

import type { ConfigVersion, ForgeConfig } from '@forge/core';
import type { DecisionForm } from '#/schemas/settings.js';
import type { FieldErrors } from '#/types/settings-fields.types.js';
import type { SubmitState } from '#/types/state.types.js';

export interface CompanyDraft {
  readonly status: 'loading' | 'error' | 'ready';
  readonly error: unknown;
  readonly retry: () => void;
  readonly retrying: boolean;
  /** The settings as edited (the saved ones until the first edit). */
  readonly config: ForgeConfig | undefined;
  /** Saved version the editor is looking at; 0 means built-in defaults. */
  readonly version: number;
  readonly history: readonly ConfigVersion[];
  readonly historyReady: boolean;
  readonly dirty: boolean;
  readonly errors: FieldErrors;
  readonly setField: (path: string, value: unknown) => void;
  readonly setConfig: (next: ForgeConfig) => void;
  readonly discard: () => void;
  readonly save: SubmitState<[DecisionForm], ConfigVersion>;
  /** True when the last save lost to someone else's save. */
  readonly conflict: boolean;
  /** Throw away the edits and load what is saved now. */
  readonly reload: () => Promise<void>;
  /** Load what is saved now and lay the edits back on top of it. */
  readonly keepMine: () => Promise<void>;
}
