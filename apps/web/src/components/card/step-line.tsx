/**
 * StepLine: one finished Director step as a quiet system line.
 *
 * Why: before it asks or plans, the Director reads the project, and the owner should be able to
 *   see that it did and what it read, without the chat filling with file lists. The line says
 *   what the step was and its one-line result ("Read 12 files"); when files were read, the
 *   result is a button that expands the list (path and size), so the evidence is one click away
 *   and the default view stays calm. Paths are untrusted text and are rendered as text.
 *
 * Exports: StepLine.
 * Depends on: react, lucide-react, domain/relative-time.
 */

import { ChevronRight, Dot } from 'lucide-react';
import { useId, useState } from 'react';
import { clockTime } from '#/domain/relative-time.js';

function bytesText(bytes: number): string {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
}

export function StepLine(props: {
  label: string;
  summary: string;
  files: readonly { path: string; bytes: number }[];
  at: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const { files } = props;
  const result =
    props.summary.trim() !== ''
      ? props.summary
      : files.length > 0
        ? `Read ${files.length} file${files.length === 1 ? '' : 's'}`
        : '';

  return (
    <div className="grid gap-1 text-xs text-muted">
      <p className="flex flex-wrap items-center gap-x-1.5">
        <Dot aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 break-words">{props.label}</span>
        {files.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-6 items-center gap-0.5 rounded-md px-1 text-signal hover:bg-hover"
          >
            <ChevronRight
              aria-hidden="true"
              className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
            />
            {result}
          </button>
        ) : result !== '' ? (
          <span className="min-w-0 break-words">{result}</span>
        ) : null}
        <time dateTime={props.at} className="font-data">
          {clockTime(props.at)}
        </time>
      </p>
      {open ? (
        <ul id={listId} aria-label="Files read" className="ml-5 grid gap-0.5">
          {files.map((file) => (
            <li key={file.path} className="flex flex-wrap items-baseline gap-2">
              <span className="min-w-0 break-all font-data text-fg">{file.path}</span>
              <span className="font-data text-faint">{bytesText(file.bytes)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
