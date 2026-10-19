/**
 * `useWelcomePrefs()`: where the first-run wizard is and whether the user chose "finish later".
 *
 * Why: the wizard spans three steps and leaves the page to reach Forge settings and back, so
 *   the current step must outlive the step components, and "Finish later" has to stick, or `/`
 *   would send the user straight back to the wizard on every visit. Both are saved in
 *   `localStorage` (`forge.ui.welcome`, d-0122) so they survive a reload. The folder typed in
 *   step 3 is only kept for the visit (a transient store) so Back and Forward do not lose it.
 *   Nothing here is server data and nothing a person types into a credential field is ever kept.
 *
 * Exports: useWelcomePrefs(), welcomePrefsStore.
 * Depends on: state/create-persisted-store, state/create-transient-store, schemas/ui-state,
 *   types/ui-state.types, types/onboarding.types.
 */

import { WelcomePrefsSchema } from '#/schemas/ui-state.js';
import { createPersistedStore } from '#/state/create-persisted-store.js';
import { createTransientStore } from '#/state/create-transient-store.js';
import type { WizardStepId } from '#/types/onboarding.types.js';
import type { WelcomePrefs } from '#/types/ui-state.types.js';

export const welcomePrefsStore = createPersistedStore<WelcomePrefs>({
  name: 'welcome',
  version: 1,
  initial: { step: null, dismissed: false },
  schema: WelcomePrefsSchema,
});

const folderStore = createTransientStore({ folder: '' });

export function useWelcomePrefs() {
  const step = welcomePrefsStore((p) => p.step);
  const dismissed = welcomePrefsStore((p) => p.dismissed);
  const folder = folderStore((p) => p.folder);

  return {
    step,
    dismissed,
    folder,
    setStep: (next: WizardStepId): void => {
      welcomePrefsStore.setState({ step: next });
    },
    setFolder: (next: string): void => {
      folderStore.setState({ folder: next });
    },
    dismiss: (): void => {
      welcomePrefsStore.setState({ dismissed: true });
    },
    reopen: (): void => {
      welcomePrefsStore.setState({ dismissed: false, step: null });
    },
  };
}
