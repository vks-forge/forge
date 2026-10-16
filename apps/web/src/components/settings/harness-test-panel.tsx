/**
 * HarnessTestPanel: "does this harness work with these settings, right now?"
 *
 * Why: a wrong path, a signed-out account or a bad key would otherwise surface hours later as
 *   a failed ticket. The test answers in seconds: which build it found, whether it is signed
 *   in, and why not if it is not. The default test is free; a second, opt-in checkbox makes
 *   one real model call to prove the whole chain, and says it costs a little. The result stays
 *   on screen with its plain-language reason until the next test, and the harness list refreshes
 *   because a test changes the harness's status.
 *
 * Exports: HarnessTestPanel.
 * Depends on: react, @tanstack/react-query, api/api-provider, api/describe-error,
 *   api/use-settings-data, components/motion/reveal, components/settings/*,
 *   components/ui/button, domain/format-time (via notice only), state/use-submit.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForgeApi } from '#/api/api-provider.js';
import { describeError } from '#/api/describe-error.js';
import { HARNESSES_KEY } from '#/api/use-settings-data.js';
import { Reveal } from '#/components/motion/reveal.js';
import { Notice } from '#/components/settings/form-field.js';
import { FormFooter } from '#/components/settings/settings-card.js';
import { Button } from '#/components/ui/button.js';
import type { HarnessTestResult } from '#/schemas/settings.js';
import { useNotify } from '#/state/notify/notify-context.js';
import { harnessName } from '#/domain/harness-labels.js';
import { useSubmit } from '#/state/use-submit.js';

const ACCOUNT_WORDS: Readonly<Record<string, string>> = {
  account: 'Signed-in account',
  api_key: 'API key',
  oauth_token: 'OAuth token',
  none: 'Not signed in',
};

function Result(props: { result: HarnessTestResult }) {
  const { result } = props;
  const rows: [string, string | undefined][] = [
    ['Build', result.version],
    ['Executable', result.binary_path],
    ['Signed in with', ACCOUNT_WORDS[result.account_kind ?? ''] ?? result.account_kind],
    [
      'Real model call',
      result.live === 'ok' ? 'Worked' : result.live === 'failed' ? 'Failed' : 'Not made',
    ],
  ];

  return (
    <Notice
      tone={result.ok ? 'good' : 'error'}
      title={result.ok ? 'The harness works' : 'The harness did not pass'}
    >
      {result.error ? <p className="mb-2">{result.error}</p> : null}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
        {rows
          .filter(([, value]) => value !== undefined)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-faint">{label}</dt>
              <dd className="font-data text-xs break-all text-fg">{value}</dd>
            </div>
          ))}
      </dl>
    </Notice>
  );
}

export function HarnessTestPanel(props: { id: string }) {
  const api = useForgeApi();
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [live, setLive] = useState(false);
  const submit = useSubmit(async (withLiveCall: boolean) => {
    const result = await api.harnesses.test(props.id, withLiveCall);
    await queryClient.invalidateQueries({ queryKey: HARNESSES_KEY });

    return result;
  });

  const [result, setResult] = useState<HarnessTestResult | null>(null);

  return (
    <div className="grid gap-4">
      <Reveal show={submit.status === 'error'}>
        <Notice tone="error" title="The test could not run">
          {describeError(submit.error).detail}
        </Notice>
      </Reveal>
      <Reveal show={result !== null}>{result ? <Result result={result} /> : null}</Reveal>
      {result === null && submit.status !== 'error' ? (
        <p className="text-sm text-muted">
          No test has been run in this session. Run one to see the build, the executable
          and how it signed in.
        </p>
      ) : null}
      <FormFooter
        help={
          <label className="flex min-h-9 items-center gap-2">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
              className="size-4 accent-[var(--signal)]"
            />
            Also make one real model call (costs a little)
          </label>
        }
      >
        <Button
          variant="primary"
          status={submit.pending ? 'loading' : 'idle'}
          onClick={() => {
            setResult(null);
            void submit.run(live).then((r) => {
              setResult(r ?? null);
              if (r) {
                const name = harnessName(props.id);

                if (r.ok) {
                  notify.success(`${name} passed the test`);
                } else {
                  notify.warning(`${name} did not pass the test`, {
                    description: r.error,
                  });
                }
              }
            });
          }}
        >
          Test harness
        </Button>
      </FormFooter>
    </div>
  );
}
