/**
 * DataFolderStep: step 1, where Forge keeps its files, read-only.
 *
 * Why: Forge writes a database, secrets, each project's memory and every Worker's working
 *   copy to one folder outside your repositories (d-0098). Someone installing it should see
 *   where that is before anything is written there, and know that it is not a repository
 *   folder. It cannot be changed from the app: it is read when Forge starts, so the step says
 *   so and how it is chosen, rather than showing a box that cannot work. The path is shown
 *   whole and breaks across lines on a phone; a copy button saves selecting it.
 *
 * Exports: DataFolderStep.
 * Depends on: react, lucide-react, @forge/core (SystemInfo, type), components/ui/button.
 */

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import type { SystemInfo } from '@forge/core';
import { Button } from '#/components/ui/button.js';

export function DataFolderStep(props: { system: SystemInfo }) {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(props.system.data_home);
      setCopied(true);
    } catch {
      // Clipboard access can be blocked; the path stays selectable on screen.
      setCopied(false);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <h2 className="text-sm font-medium">Forge keeps its files in</h2>
        <div className="flex flex-wrap items-center gap-2">
          <code
            aria-label="Data folder"
            className="min-w-0 flex-1 basis-64 select-all break-all rounded-lg border border-line bg-surface px-3 py-2 font-data text-xs"
          >
            {props.system.data_home}
          </code>
          <Button onClick={() => void copy()} status={copied ? 'success' : 'idle'}>
            {copied ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              <Copy aria-hidden="true" className="size-4" />
            )}
            {copied ? 'Copied' : 'Copy path'}
          </Button>
        </div>
      </div>
      <ul className="grid max-w-prose gap-2 text-sm text-muted">
        <li>
          It holds the database, your settings, each project's memory, stored keys and the
          working copies Workers edit. Your own repositories stay where they are.
        </li>
        <li>
          This is not a repository folder: Forge will refuse to register a project inside
          it.
        </li>
        <li>
          The folder is chosen when Forge starts, so it cannot be changed from here. By
          default it is a Forge folder in your user profile; another disk can be chosen
          with the <code className="font-data">forge-home.json</code> file in the Forge
          configuration folder, before the first start. Forge does not move existing data.
        </li>
        <li>
          Forge {props.system.version}. Anything you leave out now can be done later under
          Forge settings.
        </li>
      </ul>
    </div>
  );
}
