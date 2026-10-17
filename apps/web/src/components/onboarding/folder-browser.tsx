/**
 * FolderBrowser: a dialog for picking a folder by walking the machine's folders.
 *
 * Why: a browser never hands a page the absolute path of a folder, but Forge registers a project
 *   by the absolute path of its folder, so people were left typing `C:\code\my-app` from memory.
 *   Forge runs on the same machine, so the server lists folders (`GET /fs/folders`) and this
 *   dialog lets the person walk to theirs: it opens at the folder already chosen (or at the
 *   drives and home folder), marks the folders that are git repositories, orders them by name or
 *   date, lets them make a new folder in place, and "Select this folder" hands the path back.
 *   Right-clicking a folder (or Shift+F10) offers Open, Select, New folder inside, Copy path and
 *   Show in Explorer or Finder. Nothing is read but folder names and times. Esc and Cancel leave
 *   without choosing (Esc first closes an open new-folder row); a folder that cannot be opened
 *   says why. It is the fallback for the system folder window: when that cannot open, the
 *   dialog shows with a note saying why. This file is the frame; the walking is in the body.
 *
 * Exports: FolderBrowser.
 * Depends on: @radix-ui/react-dialog, motion/react, react, components/onboarding/folder-browser-body, theme/motion.
 */

import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { FolderBrowserBody } from '#/components/onboarding/folder-browser-body.js';
import { popVariants } from '#/theme/motion.js';

export function FolderBrowser(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The folder already chosen; the browser opens there when it is an absolute path. */
  start: string;
  onSelect: (path: string) => void;
  /** Why this browser opened instead of the system folder window, when it is the fallback. */
  note?: string | undefined;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <AnimatePresence>
        {props.open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay forceMount asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[60] bg-scrim"
              />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center p-4">
              <Dialog.Content
                forceMount
                asChild
                onEscapeKeyDown={(event) => {
                  // Radix closes on Esc before the new-folder box sees it: close the row first.
                  if (creating) {
                    event.preventDefault();
                    setCreating(false);
                  }
                }}
              >
                <motion.div
                  variants={popVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="pointer-events-auto grid max-h-full w-full max-w-2xl gap-3 scroll-area overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-float"
                >
                  <Dialog.Title className="text-base font-semibold">
                    Choose a folder
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-muted">
                    Open folders until you are inside the one you want, then select it.
                    Right-click a folder for more options. Forge only reads folder names.
                  </Dialog.Description>
                  {props.note ? <p className="text-xs text-muted">{props.note}</p> : null}
                  <FolderBrowserBody
                    start={props.start}
                    onSelect={props.onSelect}
                    onCancel={() => props.onOpenChange(false)}
                    creating={creating}
                    onCreatingChange={setCreating}
                  />
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
