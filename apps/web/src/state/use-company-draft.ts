/**
 * `useCompanyDraft()`: edit the company settings, save them as a new version, survive a conflict.
 *
 * Why: company settings are numbered versions saved with compare-and-swap (d-0085, d-0090).
 *   An editor must (1) remember which version it started from, not whatever is newest by the
 *   time Save is pressed, or it would silently overwrite a colleague's change; (2) send only
 *   what changed on top of the previous override, so untouched settings keep following
 *   built-in defaults; (3) check the draft against core's schema before sending; and (4) when
 *   the server says someone else saved first (409), offer two clear ways out: reload the
 *   latest, or lay my edits back on top of it. Unsaved edits also register with the shell's
 *   leave guard so navigating away asks first.
 *
 * Exports: useCompanyDraft().
 * Depends on: react, @tanstack/react-query, @forge/core (ForgeConfig), api/api-error,
 *   api/api-provider, api/use-settings-data, domain/*, state/unsaved-changes, state/use-submit.
 */

import { ForgeConfig } from '@forge/core';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ApiError } from '#/api/api-error.js';
import { useForgeApi } from '#/api/api-provider.js';
import {
  COMPANY_HISTORY_KEY,
  COMPANY_KEY,
  useCompanyHistory,
  useCompanySettings,
} from '#/api/use-settings-data.js';
import { sameValue, setAt } from '#/domain/config-path.js';
import { fieldErrors } from '#/domain/settings-errors.js';
import { GENERAL_GROUPS, LIMIT_GROUPS } from '#/domain/settings-fields.js';
import { applyPatch, configPatch, overrideAt } from '#/domain/settings-patch.js';
import type { DecisionForm } from '#/schemas/settings.js';
import { useUnsavedChanges } from '#/state/unsaved-changes.js';
import { useSubmit } from '#/state/use-submit.js';
import type { CompanyDraft } from '#/types/settings-draft.types.js';
import type { DraftSettings } from '#/types/settings-api.types.js';

const SPECS = [...LIMIT_GROUPS, ...GENERAL_GROUPS].flatMap((g) => g.fields);

const staleHistory = (): ApiError =>
  new ApiError(
    'http',
    'The saved history is out of date. Reload the latest settings and try again.',
    { status: 409, code: 'version_conflict' },
  );

export function useCompanyDraft(): CompanyDraft {
  const api = useForgeApi();
  const queryClient = useQueryClient();
  const company = useCompanySettings();
  const history = useCompanyHistory();
  const [edit, setEdit] = useState<DraftSettings | null>(null);

  const loaded = company.data;
  const config = edit?.config ?? loaded?.config;
  const dirty = edit !== null && !sameValue(edit.config, edit.base);
  useUnsavedChanges(dirty);

  const errors = useMemo(() => {
    const parsed = config ? ForgeConfig.safeParse(config) : null;

    return parsed && !parsed.success ? fieldErrors(parsed.error.issues, SPECS) : {};
  }, [config]);

  const save = useSubmit(async (meta: DecisionForm) => {
    if (!edit || !history.data) {
      throw staleHistory();
    }

    if (edit.version > 0 && !history.data.some((v) => v.version === edit.version)) {
      throw staleHistory();
    }

    const doc = applyPatch(
      overrideAt(history.data, edit.version),
      configPatch(edit.base, edit.config),
    );

    const saved = await api.settings.saveCompany({
      doc,
      author: meta.author,
      reason: meta.reason,
      expectedVersion: edit.version,
    });

    setEdit(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: COMPANY_KEY }),
      queryClient.invalidateQueries({ queryKey: COMPANY_HISTORY_KEY }),
    ]);

    return saved;
  });

  const latest = async () => {
    const [fresh] = await Promise.all([company.refetch(), history.refetch()]);

    return fresh.data;
  };

  const startFrom = (next: ForgeConfig): DraftSettings | null =>
    loaded
      ? {
          config: next,
          base: edit?.base ?? loaded.config,
          version: edit?.version ?? loaded.version,
        }
      : null;

  return {
    status: company.isPending ? 'loading' : company.isError ? 'error' : 'ready',
    error: company.error,
    retry: () => void company.refetch(),
    retrying: company.isFetching,
    config,
    version: edit?.version ?? loaded?.version ?? 0,
    history: history.data ?? [],
    historyReady: history.isSuccess,
    dirty,
    errors,
    setField: (path, value) => {
      if (config) {
        setEdit(startFrom(setAt(config, path, value)));
      }
    },
    setConfig: (next) => setEdit(startFrom(next)),
    discard: () => {
      setEdit(null);
      save.reset();
    },
    save,
    conflict:
      save.status === 'error' &&
      save.error instanceof ApiError &&
      save.error.status === 409,
    reload: async () => {
      setEdit(null);
      save.reset();
      await latest();
    },
    keepMine: async () => {
      if (!edit) {
        return;
      }

      const mine = configPatch(edit.base, edit.config);
      const fresh = await latest();
      save.reset();
      if (fresh) {
        const merged = applyPatch(
          fresh.config as unknown as Record<string, unknown>,
          mine,
        );

        setEdit({
          config: merged as unknown as ForgeConfig,
          base: fresh.config,
          version: fresh.version,
        });
      }
    },
  };
}
