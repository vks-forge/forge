/**
 * Protected-files copy: what the owner is told about changes to auth, migrations, secrets and
 * billing files, and why one of them waits for a signature.
 *
 * Why: the Director signs a protected-files change itself when every check passed and no secret
 *   file is touched (d-0181), and only otherwise asks the owner. Settings screens, the sign-off
 *   card and the Inbox title used to say these changes "always need you", which is no longer
 *   true and would make the owner distrust the screen. One rule sentence and one title builder
 *   keep every place saying the same true thing, and put the Director's own reason in the title
 *   when it declined. Pure.
 *
 * Exports: PROTECTED_RULE, PROTECTED_PATHS_HINT, PROTECTED_CEILING_NOTE, DIRECTOR_SIGNED_PROTECTED,
 *   signOffTitle().
 * Depends on: schemas/escalation (types). No IO.
 */

import type { SignOffCause } from '#/schemas/escalation.js';

/** The rule, in the words used wherever it is stated. */
export const PROTECTED_RULE =
  'Protected files (auth, migrations, secrets, billing): the Director signs them off only when every check passed and no secret file is touched; otherwise you do.';

/** The hint under the project's protected-path list. */
export const PROTECTED_PATHS_HINT =
  'Changes to these paths count as protected files. The Director signs them off only when every check passed and no secret file is touched; otherwise you do. One pattern per line.';

/** Added to a sign-off ceiling hint: the ceiling covers low and moderate risk, protected files follow the rule. */
export const PROTECTED_CEILING_NOTE =
  'Protected files follow their own rule: the Director signs them only when every check passed and no secret file is touched.';

/** Said on a finished change the Director signed itself, so the owner knows why nothing asked. */
export const DIRECTOR_SIGNED_PROTECTED =
  'The Director signed this off: it touches protected files, every check passed and no secret file was touched.';

const TITLE: Readonly<Record<SignOffCause, string>> = {
  tier_b: 'Ready for your sign-off',
  tier_c: 'Needs your sign-off: it touches protected files',
  owner_stage: 'Ready for your sign-off',
  director_declined: 'The Director did not sign this off: it is yours',
};

const NOTE_IN_TITLE = 90;

/**
 * The one-line title of a sign-off. A protected-files change that reached the owner says why the
 * Director did not sign, from the Director's own note, cut short so the title stays one line.
 */
export function signOffTitle(cause: SignOffCause, directorNote?: string): string {
  const base = TITLE[cause];
  const note = directorNote?.trim().replace(/\s+/g, ' ');

  if (cause !== 'tier_c' || note === undefined || note === '') {
    return base;
  }

  const short =
    note.length > NOTE_IN_TITLE ? `${note.slice(0, NOTE_IN_TITLE - 1)}…` : note;

  return `${base}. The Director did not sign: ${short}`;
}
