/**
 * HarnessSecretForm: store or replace the harness's API key or OAuth token. Write-only.
 *
 * Why: the credential goes straight to Forge's secret store and is never sent back, so this
 *   form can only say whether one is stored, never what it is. The input is a password field
 *   that is never prefilled, has no autofill, and is emptied the moment the save succeeds,
 *   so a shoulder-surfer or a screenshot never sees it. Checked before sending: one token,
 *   no spaces (the usual mistake is pasting a whole command or file). With the signed-in
 *   account there is nothing to paste, and the section says where that login comes from.
 *
 * Exports: HarnessSecretForm.
 * Depends on: react, @tanstack/react-query, api/api-provider, api/describe-error,
 *   api/use-settings-data, components/settings/*, components/ui/button, schemas/settings,
 *   state/unsaved-changes, state/use-submit.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForgeApi } from '#/api/api-provider.js';
import { describeError } from '#/api/describe-error.js';
import { HARNESSES_KEY } from '#/api/use-settings-data.js';
import { FormField, Notice, TextInput } from '#/components/settings/form-field.js';
import { StatusPill } from '#/components/settings/status-pill.js';
import { FormFooter } from '#/components/settings/settings-card.js';
import { Button } from '#/components/ui/button.js';
import { SecretForm } from '#/schemas/settings.js';
import type { HarnessView } from '#/schemas/settings.js';
import { useUnsavedChanges } from '#/state/unsaved-changes.js';
import { useNotify } from '#/state/notify/notify-context.js';
import { useSubmit } from '#/state/use-submit.js';

const KIND_WORDS = {
  api_key: { noun: 'API key', where: 'the Anthropic console' },
  oauth_token: { noun: 'OAuth token', where: '`claude setup-token`' },
} as const;

export function HarnessSecretForm(props: { harness: HarnessView }) {
  const { harness } = props;
  const api = useForgeApi();
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  useUnsavedChanges(value !== '');

  const notify = useNotify();
  const mode = harness.auth_mode;
  const submit = useSubmit(async (secret: string, kind: 'api_key' | 'oauth_token') => {
    await api.harnesses.putSecret(harness.id, { kind, value: secret });
    await queryClient.invalidateQueries({ queryKey: HARNESSES_KEY });

    return true;
  });

  if (mode === 'login') {
    return (
      <p className="text-sm text-muted">
        This harness uses the account signed in on this machine, so there is no key to
        store. If a test says you are signed out, run{' '}
        <code className="font-data">claude login</code> in a terminal and test again.
      </p>
    );
  }

  const words = KIND_WORDS[mode];
  const stored = harness.secrets[mode];

  const save = async (): Promise<void> => {
    const parsed = SecretForm.safeParse({ value });
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message);

      return;
    }

    setProblem(undefined);
    const result = await submit.run(parsed.data.value, mode);
    if (result) {
      setValue('');
      notify.success(`${words.noun} stored`, {
        description: 'It is hidden for good. Run the test to check it works.',
      });
    }
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{words.noun}</span>
        {stored ? (
          <StatusPill tone="good">Stored</StatusPill>
        ) : (
          <StatusPill tone="attn">Not stored yet</StatusPill>
        )}
      </div>
      <FormField
        id="harness-secret"
        label={stored ? `Replace the ${words.noun}` : `Paste the ${words.noun}`}
        hint={`Get it from ${words.where}. It is stored by Forge and cannot be shown again.`}
        error={problem}
      >
        <TextInput
          id="harness-secret"
          hasHint
          type="password"
          value={value}
          autoComplete="off"
          spellCheck={false}
          error={problem}
          onChange={(e) => {
            setValue(e.target.value);
            setProblem(undefined);
            submit.reset();
          }}
        />
      </FormField>
      {submit.status === 'error' ? (
        <Notice tone="error" title={`The ${words.noun} was not stored`}>
          {describeError(submit.error).detail}
        </Notice>
      ) : null}
      <FormFooter help="Write-only: Forge stores it and never shows it again.">
        <Button
          type="submit"
          variant="primary"
          disabled={value === ''}
          status={submit.pending ? 'loading' : 'idle'}
        >
          {stored ? `Replace ${words.noun}` : `Store ${words.noun}`}
        </Button>
      </FormFooter>
    </form>
  );
}
