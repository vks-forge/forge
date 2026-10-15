/**
 * DecisionDialog: the confirm step before an approval, with the name and reason that get recorded.
 *
 * Why: approving a changed tool lets Workers use it; denying it blocks it. Either is recorded
 *   with who decided and why (the server requires both), and neither should happen on a stray
 *   click. This dialog states exactly what will change, asks for the reason in the same place,
 *   keeps focus on "Cancel" so Enter or Escape is always the safe answer, and stays open with
 *   the server's message if the call fails so nothing typed is lost.
 *
 * Exports: DecisionDialog.
 * Depends on: react, @radix-ui/react-alert-dialog, motion/react, components/ui/button,
 *   components/settings/form-field, schemas/settings, state/use-author-prefs, theme/motion.
 */

import * as Alert from '@radix-ui/react-alert-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { FormField, Notice, TextInput } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { DecisionForm } from '#/schemas/settings.js';
import { useAuthorPrefs } from '#/state/use-author-prefs.js';
import { popVariants } from '#/theme/motion.js';

export function DecisionDialog(props: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'primary' | 'danger';
  pending: boolean;
  error?: string | undefined;
  onConfirm: (decision: DecisionForm) => void;
  onCancel: () => void;
}) {
  const [author, setAuthor] = useAuthorPrefs();
  const [reason, setReason] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});

  const submit = (): void => {
    const parsed = DecisionForm.safeParse({ author, reason });
    if (!parsed.success) {
      setProblems(
        Object.fromEntries(
          parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
        ),
      );

      return;
    }

    setProblems({});
    props.onConfirm(parsed.data);
  };

  return (
    <Alert.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !props.pending) {
          props.onCancel();
        }
      }}
    >
      <AnimatePresence>
        {props.open ? (
          <Alert.Portal forceMount>
            <Alert.Overlay forceMount asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-scrim"
              />
            </Alert.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
              <Alert.Content forceMount asChild>
                <motion.div
                  variants={popVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="pointer-events-auto grid max-h-[90dvh] w-full max-w-md gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-float"
                >
                  <Alert.Title className="text-base font-semibold">
                    {props.title}
                  </Alert.Title>
                  <Alert.Description className="text-sm text-muted">
                    {props.description}
                  </Alert.Description>
                  <FormField
                    id="decision-author"
                    label="Your name"
                    error={problems['author']}
                  >
                    <TextInput
                      id="decision-author"
                      value={author}
                      autoComplete="name"
                      error={problems['author']}
                      onChange={(e) => setAuthor(e.target.value)}
                    />
                  </FormField>
                  <FormField
                    id="decision-reason"
                    label="Reason"
                    hint="Kept with the decision so it can be audited later."
                    error={problems['reason']}
                  >
                    <TextInput
                      id="decision-reason"
                      hasHint
                      value={reason}
                      error={problems['reason']}
                      onChange={(e) => setReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          submit();
                        }
                      }}
                    />
                  </FormField>
                  {props.error ? (
                    <Notice tone="error" title="The decision was not saved">
                      {props.error}
                    </Notice>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Alert.Cancel asChild>
                      <Button variant="quiet" disabled={props.pending}>
                        Cancel
                      </Button>
                    </Alert.Cancel>
                    <Button
                      variant={props.tone}
                      status={props.pending ? 'loading' : 'idle'}
                      onClick={submit}
                    >
                      {props.confirmLabel}
                    </Button>
                  </div>
                </motion.div>
              </Alert.Content>
            </div>
          </Alert.Portal>
        ) : null}
      </AnimatePresence>
    </Alert.Root>
  );
}
