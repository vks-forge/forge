/**
 * FolderContextMenu: the right-click (or Shift+F10, or menu-key) menu of one folder in the browser.
 *
 * Why: the folder list is about walking and choosing, and the next thing people reach for on a
 *   folder is "what else can I do with this": open it, choose it right away, make a folder
 *   inside it, copy its path, or look at it in Explorer or Finder. A context menu puts those
 *   within one gesture and works for the keyboard too. It is a Radix menu opened at the pointer
 *   (or beside the active row), so arrows, Esc, type-ahead and focus return are the platform's.
 *   Radix has no context-menu package here, so an invisible anchor sits at the pointer and the
 *   dropdown opens from it.
 *
 * Exports: FolderContextMenu.
 * Depends on: @radix-ui/react-dropdown-menu, lucide-react, motion/react, @forge/core (FolderEntry, type),
 *   domain/file-manager, theme/motion, types/folder-browser.types.
 */

import * as Menu from '@radix-ui/react-dropdown-menu';
import { Copy, ExternalLink, FolderOpen, FolderPlus, SquareCheckBig } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { FolderEntry } from '@forge/core';
import { revealLabel } from '#/domain/file-manager.js';
import { popVariants } from '#/theme/motion.js';
import type { FolderMenuTarget } from '#/types/folder-browser.types.js';

const ROW =
  'flex min-h-9 cursor-default select-none items-center gap-2 rounded-md px-2 text-sm outline-none data-[highlighted]:bg-hover';

export function FolderContextMenu(props: {
  target: FolderMenuTarget | null;
  onClose: () => void;
  onOpen: (entry: FolderEntry) => void;
  onSelect: (entry: FolderEntry) => void;
  onNewInside: (entry: FolderEntry) => void;
  onCopy: (entry: FolderEntry) => void;
  onReveal: (entry: FolderEntry) => void;
}) {
  const { target } = props;

  return (
    <Menu.Root
      open={target !== null}
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <Menu.Trigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-0"
          style={{ left: target?.x ?? 0, top: target?.y ?? 0 }}
        />
      </Menu.Trigger>
      <AnimatePresence>
        {target ? (
          <Menu.Portal forceMount>
            <Menu.Content
              forceMount
              asChild
              align="start"
              side="bottom"
              sideOffset={2}
              aria-label={`Actions for ${target.entry.name}`}
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <motion.div
                variants={popVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                style={{
                  transformOrigin: 'var(--radix-dropdown-menu-content-transform-origin)',
                }}
                className="z-[70] min-w-56 max-w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-1.5 shadow-float"
              >
                <Menu.Item className={ROW} onSelect={() => props.onOpen(target.entry)}>
                  <FolderOpen aria-hidden="true" className="size-4 text-muted" />
                  Open
                </Menu.Item>
                <Menu.Item className={ROW} onSelect={() => props.onSelect(target.entry)}>
                  <SquareCheckBig aria-hidden="true" className="size-4 text-muted" />
                  Select this folder
                </Menu.Item>
                <Menu.Item
                  className={ROW}
                  onSelect={() => props.onNewInside(target.entry)}
                >
                  <FolderPlus aria-hidden="true" className="size-4 text-muted" />
                  New folder inside
                </Menu.Item>
                <Menu.Separator className="my-1 h-px bg-line" />
                <Menu.Item className={ROW} onSelect={() => props.onCopy(target.entry)}>
                  <Copy aria-hidden="true" className="size-4 text-muted" />
                  Copy path
                </Menu.Item>
                <Menu.Item className={ROW} onSelect={() => props.onReveal(target.entry)}>
                  <ExternalLink aria-hidden="true" className="size-4 text-muted" />
                  {revealLabel()}
                </Menu.Item>
              </motion.div>
            </Menu.Content>
          </Menu.Portal>
        ) : null}
      </AnimatePresence>
    </Menu.Root>
  );
}
