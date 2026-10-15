/**
 * ConnectionForm: connect a GitHub App Forge already owns the id and private key of.
 *
 * Why: Forge reaches repositories through a GitHub App, and an App belongs to one account or
 *   organisation, so a company with repositories in several needs several connections (d-0094).
 *   The one-click App creation flow is not built yet (d-0084 fallback), so for now the owner
 *   enters an existing App's id and private key. The key goes to Forge's secret store and is
 *   never shown again: the field is emptied the moment the save succeeds, and the form checks
 *   it looks like a whole PEM before sending, because a half-pasted key is the common failure.
 *
 * Exports: ConnectionForm.
 * Depends on: react, @tanstack/react-query, api/api-provider, api/describe-error,
 *   api/use-settings-data, components/settings/form-field, components/ui/button,
 *   schemas/settings, state/unsaved-changes, state/use-submit.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForgeApi } from '#/api/api-provider.js';
import { describeError } from '#/api/describe-error.js';
import { GITHUB_KEY } from '#/api/use-settings-data.js';
import {
  FormField,
  INPUT_CLASS,
  Notice,
  TextInput,
} from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { ConnectionForm as ConnectionSchema } from '#/schemas/settings.js';
import { useUnsavedChanges } from '#/state/unsaved-changes.js';
import { useSubmit } from '#/state/use-submit.js';

const EMPTY = { account: '', app_id: '', app_slug: '', private_key_pem: '' };

export function ConnectionForm(props: { onDone: () => void; onCancel: () => void }) {
  const api = useForgeApi();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(EMPTY);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const dirty = Object.values(values).some((v) => v !== '');
  useUnsavedChanges(dirty);

  const submit = useSubmit(async (body: typeof EMPTY) => {
    await api.github.add({
      account: body.account,
      app_id: body.app_id,
      private_key_pem: body.private_key_pem,
      ...(body.app_slug === '' ? {} : { app_slug: body.app_slug }),
    });

    await queryClient.invalidateQueries({ queryKey: GITHUB_KEY });

    return true;
  });

  const set =
    (key: keyof typeof EMPTY) =>
    (value: string): void => {
      setValues((previous) => ({ ...previous, [key]: value }));
      setProblems((previous) => ({ ...previous, [key]: '' }));
      submit.reset();
    };

  const save = async (): Promise<void> => {
    const parsed = ConnectionSchema.safeParse(values);
    if (!parsed.success) {
      setProblems(
        Object.fromEntries(
          parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
        ),
      );

      return;
    }

    if (await submit.run(parsed.data)) {
      // Clear first so the key is gone from the page before anything else happens.
      setValues(EMPTY);
      props.onDone();
    }
  };

  return (
    <form
      aria-label="Add a GitHub connection"
      className="grid gap-4 rounded-xl border border-line bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <FormField
        id="gh-account"
        label="GitHub account or organisation"
        error={problems['account']}
      >
        <TextInput
          id="gh-account"
          value={values.account}
          autoComplete="off"
          error={problems['account']}
          onChange={(e) => set('account')(e.target.value)}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="gh-app-id"
          label="App ID"
          hint="The number on the App's settings page."
          error={problems['app_id']}
        >
          <TextInput
            id="gh-app-id"
            hasHint
            inputMode="numeric"
            value={values.app_id}
            autoComplete="off"
            error={problems['app_id']}
            onChange={(e) => set('app_id')(e.target.value)}
          />
        </FormField>
        <FormField
          id="gh-app-slug"
          label="App slug (optional)"
          hint="The name in the App's URL."
        >
          <TextInput
            id="gh-app-slug"
            hasHint
            value={values.app_slug}
            autoComplete="off"
            onChange={(e) => set('app_slug')(e.target.value)}
          />
        </FormField>
      </div>
      <FormField
        id="gh-key"
        label="Private key (.pem)"
        hint="Stored by Forge and never shown again."
        error={problems['private_key_pem']}
      >
        <textarea
          id="gh-key"
          rows={5}
          value={values.private_key_pem}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={problems['private_key_pem'] ? true : undefined}
          aria-describedby={`gh-key-hint${problems['private_key_pem'] ? ' gh-key-error' : ''}`}
          onChange={(e) => set('private_key_pem')(e.target.value)}
          className={`${INPUT_CLASS} py-2 font-data text-xs`}
        />
      </FormField>
      {submit.status === 'error' ? (
        <Notice tone="error" title="The connection was not added">
          {describeError(submit.error).detail}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="primary"
          status={submit.pending ? 'loading' : 'idle'}
        >
          Add connection
        </Button>
        <Button onClick={props.onCancel} disabled={submit.pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
