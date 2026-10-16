/**
 * StepChecks: the commands Forge re-runs on every ticket before it merges.
 *
 * Why: a ticket is only merged after the project's own checks (tests, lint, build) pass again
 *   on the merged result, so they must be right. Forge suggests them from the files it found;
 *   this step shows them as the same editable list the project settings screen uses, and says
 *   plainly when none were found, so the person knows an empty list means an unchecked merge
 *   rather than something Forge forgot.
 *
 * Exports: StepChecks.
 * Depends on: routes/project-settings/checks-editor, types/onboarding.types.
 */

import { ChecksEditor } from '#/routes/project-settings/checks-editor.js';
import type { ProjectWizard } from '#/types/onboarding.types.js';

export function StepChecks(props: { wizard: ProjectWizard }) {
  const { wizard } = props;
  const detected = wizard.inspection?.checks.length ?? 0;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">
        {detected > 0
          ? 'Commands Forge re-runs on every ticket before it merges. They were found in your files; change them if they are wrong.'
          : "Forge found no checks in this folder. Without checks a ticket is merged on the Worker's word alone; add the commands that prove your project works, or continue and add them later in project settings."}
      </p>
      <ChecksEditor
        checks={wizard.draft.checks}
        onChange={(checks) => wizard.patch({ checks })}
      />
      {wizard.shown.checks ? (
        <p role="alert" className="text-xs text-danger">
          {wizard.shown.checks}
        </p>
      ) : null}
    </div>
  );
}
