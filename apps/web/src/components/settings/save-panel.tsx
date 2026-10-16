/**
 * SavePanel: save the edited settings as a new version, or deal with a conflicting save.
 *
 * Why: every save becomes a numbered, attributed version, so the panel asks for who and why
 *   (the audit trail is the point of versioning) and shows the version the edit started from.
 *   It stays quiet until there is something to save, says exactly how many fields block the
 *   save, and never fails silently. If someone else saved after this page was opened (a 409),
 *   it explains in plain words and offers two ways forward: reload the latest and drop these
 *   edits, or load the latest and lay these edits back on top for review. It sits at the foot
 *   of the form so it is where the thumb and the eye end up.
 *
 * Exports: SavePanel.
 * Depends on: react, components/motion/reveal, components/settings/form-field,
 *   components/settings/settings-card, components/ui/button, api/describe-error, schemas/settings, state/use-author-prefs,
 *   types/settings-draft.types.
 */

import { useState } from 'react';
import { describeError } from '#/api/describe-error.js';
import { Reveal } from '#/components/motion/reveal.js';
import { FormField, Notice, TextInput } from '#/components/settings/form-field.js';
import { FormFooter } from '#/components/settings/settings-card.js';
import { Button } from '#/components/ui/button.js';
import { DecisionForm } from '#/schemas/settings.js';
import { useNotify } from '#/state/notify/notify-context.js';
import { useAuthorPrefs } from '#/state/use-author-prefs.js';
import type { CompanyDraft } from '#/types/settings-draft.types.js';

export function SavePanel(props: { draft: CompanyDraft }) {
  const { draft } = props;
  const notify = useNotify();
  const [author, setAuthor] = useAuthorPrefs();
  const [reason, setReason] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const invalid = Object.keys(draft.errors).length;

  const submit = async (): Promise<void> => {
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
    if (await draft.save.run(parsed.data)) {
      setReason('');
      notify.success('Saved as a new version', {
        description: 'The Director picks it up on its next tick; no restart is needed.',
      });
    }
  };

  return (
    <div className="grid gap-4">
      <Reveal show={draft.conflict}>
        <Notice tone="warn" title="These settings changed since you opened this page">
          <p>
            Someone saved a newer version, so nothing was overwritten. You can reload the
            latest settings and drop your edits, or load the latest and keep your edits on
            top of it to review before saving.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void draft.reload()}>
              Reload latest, drop my edits
            </Button>
            <Button onClick={() => void draft.keepMine()}>Keep my edits on top</Button>
          </div>
        </Notice>
      </Reveal>
      <Reveal show={draft.save.status === 'error' && !draft.conflict}>
        <Notice tone="error" title="The settings were not saved">
          {describeError(draft.save.error).detail}
        </Notice>
      </Reveal>
      {draft.dirty ? (
        <form
          aria-label="Save settings"
          className="grid gap-4 overflow-hidden rounded-xl border border-line bg-surface p-5 md:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-1">
            <h2 className="text-base font-semibold tracking-tight">Save your changes</h2>
            <p className="text-sm text-muted">
              Saving creates version {draft.version + 1}. Version {draft.version} stays in
              the history.
            </p>
          </div>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <FormField id="save-author" label="Your name" error={problems['author']}>
              <TextInput
                id="save-author"
                value={author}
                autoComplete="name"
                error={problems['author']}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </FormField>
            <FormField
              id="save-reason"
              label="Why you are changing it"
              error={problems['reason']}
            >
              <TextInput
                id="save-reason"
                value={reason}
                error={problems['reason']}
                onChange={(e) => setReason(e.target.value)}
              />
            </FormField>
          </div>
          <FormFooter
            help={
              invalid > 0 ? (
                <span role="status" className="text-danger">
                  Fix {invalid} field{invalid === 1 ? '' : 's'} marked above before
                  saving.
                </span>
              ) : (
                'The Director picks it up on its next tick.'
              )
            }
          >
            <Button onClick={draft.discard} disabled={draft.save.pending}>
              Discard edits
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={invalid > 0 || !draft.historyReady}
              status={draft.save.pending ? 'loading' : 'idle'}
            >
              Save as version {draft.version + 1}
            </Button>
          </FormFooter>
        </form>
      ) : null}
    </div>
  );
}
