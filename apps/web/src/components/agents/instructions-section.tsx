/**
 * InstructionsSection: the markdown an agent is given, with a preview of how it reads.
 *
 * Why: instructions are the one part of an agent that is prose, up to 20 000 characters, and
 *   they are appended to the Worker's brief for every run. A plain monospace box is the right
 *   place to write them; the preview, drawn with the same safe markdown renderer as the thread
 *   (no HTML, links limited to http and https), shows headings and lists as the model will see
 *   structure. A project override edits this same field, so the section also says when it is
 *   showing the company's text.
 *
 * Exports: InstructionsSection.
 * Depends on: react, components/settings/{settings-card,form-field}, components/ui/toggle-group,
 *   components/thread/markdown-text, schemas/agents (limit).
 */

import { useState } from 'react';
import { INPUT_CLASS } from '#/components/settings/form-field.js';
import { SettingsCard } from '#/components/settings/settings-card.js';
import { MarkdownText } from '#/components/thread/markdown-text.js';
import { ToggleGroup } from '#/components/ui/toggle-group.js';

const LIMIT = 20_000;

export function InstructionsSection(props: {
  value: string;
  onChange: (next: string) => void;
  error: string | undefined;
  disabled: boolean;
  /** Set on a project screen over a company agent: the text starts as the company's. */
  note?: string;
}) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const over = props.value.length > LIMIT;

  return (
    <SettingsCard
      id="instructions"
      title="Instructions"
      description="Markdown added to the Worker’s brief on every run. Leave it empty to add nothing."
    >
      <div className="grid gap-3">
        {props.note ? <p className="text-sm text-muted">{props.note}</p> : null}
        <ToggleGroup
          label="Instructions view"
          value={mode}
          options={[
            { value: 'write', label: 'Write' },
            { value: 'preview', label: 'Preview' },
          ]}
          onChange={setMode}
        />
        {mode === 'write' ? (
          <textarea
            aria-label="Instructions (markdown)"
            rows={14}
            value={props.value}
            disabled={props.disabled}
            spellCheck
            aria-invalid={props.error || over ? true : undefined}
            aria-describedby="instructions-count"
            onChange={(e) => props.onChange(e.target.value)}
            className={`${INPUT_CLASS} max-w-none py-2 font-data text-xs leading-relaxed`}
          />
        ) : (
          <div
            aria-label="Instructions preview"
            role="region"
            className="min-h-40 rounded-lg border border-line bg-bg p-4 text-sm"
          >
            {props.value.trim() === '' ? (
              <p className="text-muted">
                Nothing to preview. The agent adds no instructions.
              </p>
            ) : (
              <MarkdownText text={props.value} />
            )}
          </div>
        )}
        <p
          id="instructions-count"
          className={`text-xs ${over ? 'text-danger' : 'text-muted'}`}
        >
          {props.value.length.toLocaleString('en-US')} of {LIMIT.toLocaleString('en-US')}{' '}
          characters
        </p>
        {props.error ? (
          <p role="alert" className="text-xs text-danger">
            {props.error}
          </p>
        ) : null}
      </div>
    </SettingsCard>
  );
}
