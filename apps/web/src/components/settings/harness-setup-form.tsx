/**
 * HarnessSetupForm: where the harness executable is and how it signs in.
 *
 * Why: Workers run the `claude` the user installed (d-0087, d-0101), and it can sign in three
 *   ways: the account already logged in on this machine, an API key, or an OAuth token. The
 *   choice changes billing and what the credential field below must hold, so the three are
 *   plain radio options with one sentence each, not a dropdown that hides them. The path is
 *   optional (empty means "find it on PATH"). Saving resets the last test result on the
 *   server because it no longer describes these settings, and the form says so. The
 *   "Bypass permissions" switch (on by default, d-0183) saves with the same button.
 *
 * Exports: HarnessSetupForm.
 * Depends on: react, @tanstack/react-query, @forge/core (HarnessAuthMode), api/api-provider,
 *   api/use-settings-data, components/settings/{bypass-field,form-field}, components/settings/settings-card, components/ui/button,
 *   state/unsaved-changes, state/use-submit, api/describe-error.
 */

import type { HarnessAuthMode } from '@forge/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForgeApi } from '#/api/api-provider.js';
import { describeError } from '#/api/describe-error.js';
import { HARNESSES_KEY } from '#/api/use-settings-data.js';
import { BypassField } from '#/components/settings/bypass-field.js';
import { FormField, Notice, TextInput } from '#/components/settings/form-field.js';
import { FormFooter } from '#/components/settings/settings-card.js';
import { Button } from '#/components/ui/button.js';
import type { HarnessView } from '#/schemas/settings.js';
import { useUnsavedChanges } from '#/state/unsaved-changes.js';
import { useNotify } from '#/state/notify/notify-context.js';
import { useSubmit } from '#/state/use-submit.js';

const MODES: readonly { value: HarnessAuthMode; label: string; help: string }[] = [
  {
    value: 'login',
    label: 'Signed-in account',
    help: 'Uses the account you are signed in with on this machine (run `claude login` in a terminal).',
  },
  {
    value: 'api_key',
    label: 'API key',
    help: 'Bills your Anthropic API account. Paste the key in the next section.',
  },
  {
    value: 'oauth_token',
    label: 'OAuth token',
    help: 'A long-lived token from `claude setup-token`. Paste it in the next section.',
  },
];

export function HarnessSetupForm(props: {
  id: string;
  harness: HarnessView | undefined;
}) {
  const api = useForgeApi();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const saved = {
    auth_mode: props.harness?.auth_mode ?? 'login',
    binary_path: props.harness?.binary_path ?? '',
    bypass:
      props.harness?.bypass_permissions_effective ??
      props.harness?.bypass_permissions ??
      true,
  };

  const [mode, setMode] = useState<HarnessAuthMode>(saved.auth_mode);
  const [path, setPath] = useState(saved.binary_path);
  const [bypass, setBypass] = useState(saved.bypass);
  const dirty =
    props.harness === undefined ||
    mode !== saved.auth_mode ||
    path !== saved.binary_path ||
    bypass !== saved.bypass;

  useUnsavedChanges(dirty && props.harness !== undefined);

  const submit = useSubmit(async () => {
    const trimmed = path.trim();
    await api.harnesses.save(props.id, {
      kind: 'claude',
      auth_mode: mode,
      bypass_permissions: bypass,
      ...(trimmed === '' ? {} : { binary_path: trimmed }),
    });

    await queryClient.invalidateQueries({ queryKey: HARNESSES_KEY });

    return true;
  });

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit.run().then((ok) => {
          if (ok) {
            notify.success('Saved', {
              description:
                'The last test result was cleared. Run the test again to check these settings.',
            });
          }
        });
      }}
    >
      <fieldset className="grid max-w-xl gap-2">
        <legend className="mb-1 text-sm font-medium">How it signs in</legend>
        {MODES.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface p-3 transition-colors duration-150 has-[:checked]:border-signal has-[:checked]:bg-signal-soft hover:border-faint"
          >
            <input
              type="radio"
              name="auth-mode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => {
                setMode(option.value);
                submit.reset();
              }}
              className="mt-1 size-4 accent-[var(--signal)]"
            />
            <span className="grid gap-0.5 text-sm">
              <span className="font-medium">{option.label}</span>
              <span className="text-muted">{option.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <FormField
        id="harness-path"
        label="Path to the executable"
        hint="Leave empty to find `claude` on PATH."
      >
        <TextInput
          id="harness-path"
          hasHint
          value={path}
          spellCheck={false}
          autoComplete="off"
          placeholder="Found on PATH"
          onChange={(e) => {
            setPath(e.target.value);
            submit.reset();
          }}
        />
      </FormField>
      <BypassField
        checked={bypass}
        onChange={(next) => {
          setBypass(next);
          submit.reset();
        }}
      />
      {submit.status === 'error' ? (
        <Notice tone="error" title="The harness settings were not saved">
          {describeError(submit.error).detail}
        </Notice>
      ) : null}
      <FormFooter help="Changes apply to the next run and clear the last test result.">
        <Button
          type="submit"
          variant="primary"
          disabled={!dirty}
          status={
            submit.pending ? 'loading' : submit.status === 'error' ? 'error' : 'idle'
          }
        >
          {props.harness ? 'Save sign-in settings' : `Register ${props.id}`}
        </Button>
      </FormFooter>
    </form>
  );
}
