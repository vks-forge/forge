/**
 * AddStageMenu: the kinds of stage an owner can add, behind one button.
 *
 * Why: a pipeline grows by adding an agent that does a piece of work, a script that checks it,
 *   a group of checks that run together (or of writers that work side by side), the Director's
 *   check against the plan, or the sign-off. Merge is always there and is never added. Putting
 *   them behind one clearly named button keeps the list quiet, and an entry that cannot be added
 *   now (a second sign-off or Director check, a thirteenth stage) stays in the
 *   menu, greyed, with its reason, instead of vanishing. Every entry is a real menu item, so the
 *   whole menu works from the keyboard.
 *
 * Exports: AddStageMenu.
 * Depends on: @radix-ui/react-dropdown-menu, lucide-react, components/ui/button, domain/pipeline-add.
 */

import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  Bot,
  ChevronDown,
  ClipboardCheck,
  Layers,
  PenLine,
  Stamp,
  Terminal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PipelineDefinition } from '@forge/core';
import { Button } from '#/components/ui/button.js';
import { addAction } from '#/domain/pipeline-add.js';
import type { AddKind } from '#/types/pipeline-ui.types.js';

const ITEM =
  'flex min-h-10 cursor-default select-none items-start gap-3 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-50';

const ENTRIES: readonly {
  kind: AddKind;
  icon: LucideIcon;
  title: string;
  hint: string;
}[] = [
  {
    kind: 'agent',
    icon: Bot,
    title: 'Agent',
    hint: 'A Worker, reviewer or tester does a piece of the work.',
  },
  {
    kind: 'script_gate',
    icon: Terminal,
    title: 'Script gate',
    hint: 'Your own command checks the change; exit 0 passes.',
  },
  {
    kind: 'group',
    icon: Layers,
    title: 'Run-together group',
    hint: 'Two to four checks at once; all must pass.',
  },
  {
    kind: 'writer_group',
    icon: PenLine,
    title: 'Writers together',
    hint: 'Two to four writers at once, each in its own folders.',
  },
  {
    kind: 'director_check',
    icon: ClipboardCheck,
    title: 'Director check',
    hint: 'The Director compares the work with the plan.',
  },
  {
    kind: 'sign_off',
    icon: Stamp,
    title: 'Sign-off',
    hint: 'The Director signs when every check passed and the change is within its limit; otherwise you sign.',
  },
];

export function AddStageMenu(props: {
  def: PipelineDefinition;
  disabled?: boolean;
  onAdd: (kind: AddKind) => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button disabled={props.disabled ?? false}>
          Add stage
          <ChevronDown aria-hidden="true" className="size-4" />
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          className="z-[70] w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-1 shadow-float"
        >
          {ENTRIES.map(({ kind, icon: Icon, title, hint }) => {
            const gate = addAction(props.def, kind);

            return (
              <Menu.Item
                key={kind}
                className={ITEM}
                disabled={!gate.ok}
                onSelect={() => props.onAdd(kind)}
              >
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                <span className="grid">
                  {title}
                  <span className="text-xs text-muted">
                    {gate.ok ? hint : gate.reason}
                  </span>
                </span>
              </Menu.Item>
            );
          })}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
