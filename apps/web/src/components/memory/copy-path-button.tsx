/**
 * CopyPathButton: copies a folder path and says so.
 *
 * Why: the memory screens name two places on the owner's disk (the pre-migration backup and a
 *   markdown export). A path is only useful if it can be pasted into a terminal or a file
 *   manager, and retyping a long path invites mistakes. The button confirms with a check and
 *   the word "Copied"; if the browser blocks clipboard access it says so and leaves the path
 *   selectable on screen instead of failing silently.
 *
 * Exports: CopyPathButton.
 * Depends on: react, lucide-react, components/ui/button.
 */

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '#/components/ui/button.js';

export function CopyPathButton(props: { path: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'blocked'>('idle');

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(props.path);
      setState('copied');
    } catch {
      setState('blocked');
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        onClick={() => void copy()}
        status={state === 'copied' ? 'success' : state === 'blocked' ? 'error' : 'idle'}
        className="min-h-8"
      >
        {state === 'copied' ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <Copy aria-hidden="true" className="size-4" />
        )}
        {state === 'copied' ? 'Copied' : (props.label ?? 'Copy path')}
      </Button>
      {state === 'blocked' ? (
        <span role="status" className="text-xs text-danger">
          Your browser blocked copying. Select the path instead.
        </span>
      ) : null}
    </span>
  );
}
