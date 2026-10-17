/**
 * NewAgentMenu: the three ways to make an agent, behind one button.
 *
 * Why: an owner arrives with one of three intentions: they know what they want (from scratch),
 *   they want a head start (a template), or they can say what the agent is for but not how to
 *   write it down (describe it to the Director). Putting the three choices behind one clearly
 *   named button keeps the roster header quiet and makes each path discoverable by its plain
 *   name. The menu opens with the keyboard and its entries are real menu items.
 *
 * Exports: NewAgentMenu.
 * Depends on: @radix-ui/react-dropdown-menu, lucide-react, components/ui/button.
 */

import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, FilePlus2, LayoutTemplate, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '#/components/ui/button.js';

const ITEM =
  'flex min-h-10 cursor-default select-none items-start gap-3 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-hover';

export function NewAgentMenu(props: {
  label: string;
  onScratch: () => void;
  onTemplate: () => void;
  onDescribe: () => void;
}) {
  const entries: readonly {
    icon: LucideIcon;
    title: string;
    hint: string;
    run: () => void;
  }[] = [
    {
      icon: FilePlus2,
      title: 'From scratch',
      hint: 'Fill in every field yourself.',
      run: props.onScratch,
    },
    {
      icon: LayoutTemplate,
      title: 'From template',
      hint: 'Start from a ready-made reviewer or writer.',
      run: props.onTemplate,
    },
    {
      icon: Sparkles,
      title: 'Describe it to the Director',
      hint: 'Say what it is for; the Director drafts it.',
      run: props.onDescribe,
    },
  ];

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="primary">
          {props.label}
          <ChevronDown aria-hidden="true" className="size-4" />
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-[70] w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-1 shadow-float"
        >
          {entries.map(({ icon: Icon, title, hint, run }) => (
            <Menu.Item key={title} className={ITEM} onSelect={run}>
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
              <span className="grid">
                {title}
                <span className="text-xs text-muted">{hint}</span>
              </span>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
