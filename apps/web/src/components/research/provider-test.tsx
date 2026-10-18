/**
 * ProviderTest: the "Test provider" button and what it found, in words.
 *
 * Why: the search provider is a program on this machine that is often not running, and the
 *   owner should learn that now, not when a card's research silently comes back empty. The
 *   button tries the settings that are on screen (so a new address can be tried before it is
 *   saved) and says either how fast the provider answered or, in plain words, what is wrong and
 *   what to do about it. Nothing is saved by testing, and the line says so. While settings have
 *   errors the button is disabled with the reason beside it, not just greyed out.
 *
 * Exports: ProviderTest.
 * Depends on: api/use-research, api/describe-error, components/settings/form-field,
 *   components/ui/button, domain/research-copy, @forge/core (types).
 */

import type { ResearchSettings } from '@forge/core';
import { describeError } from '#/api/describe-error.js';
import { useTestResearch } from '#/api/use-research.js';
import { Notice } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { providerTestWords } from '#/domain/research-copy.js';

export function ProviderTest(props: {
  settings: ResearchSettings;
  /** True while the draft has problems; the request would only be refused. */
  blocked: boolean;
}) {
  const test = useTestResearch();
  const words = test.data ? providerTestWords(test.data) : null;

  return (
    <div className="grid max-w-xl gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          status={test.isPending ? 'loading' : 'idle'}
          disabled={props.blocked}
          aria-describedby="research-test-note"
          onClick={() => test.mutate({ research: props.settings })}
        >
          Test provider
        </Button>
        <p id="research-test-note" className="text-xs text-muted">
          {props.blocked
            ? 'Fix the fields marked above first.'
            : 'Tries the settings on this screen, saved or not. Nothing is saved.'}
        </p>
      </div>
      {words ? (
        words.ok ? (
          <Notice tone="good" title={words.headline} />
        ) : (
          <Notice tone="error" title={words.headline}>
            {words.fix}
          </Notice>
        )
      ) : null}
      {test.isError ? (
        <Notice tone="error" title={describeError(test.error).title}>
          {describeError(test.error).detail}
        </Notice>
      ) : null}
    </div>
  );
}
