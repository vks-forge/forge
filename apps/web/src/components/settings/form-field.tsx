/**
 * FormField, TextInput and Notice: the shared pieces of every settings form.
 *
 * Why: forms in this area hold credentials and caps, so mistakes must be caught where they
 *   happen and explained in words. A field always has a visible label (never a placeholder
 *   standing in for one), puts its hint and its error under the control, and links both to
 *   the input so a screen reader reads them with it. An error is announced and also marked
 *   with an icon, never colour alone. `Notice` is the one banner for results that matter
 *   (saved, conflict, failed), announced politely or assertively depending on urgency.
 *
 * Exports: FormField, TextInput, Notice, INPUT_CLASS.
 * Depends on: react, lucide-react.
 */

import { Check, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export const INPUT_CLASS =
  'min-h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-fg transition-colors duration-150 placeholder:text-faint hover:border-faint disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger';

export function FormField(props: {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="grid w-full max-w-xl gap-1.5">
      <label htmlFor={props.id} className="text-sm font-medium">
        {props.label}
      </label>
      {props.children}
      {props.hint ? (
        <p id={`${props.id}-hint`} className="text-xs text-muted">
          {props.hint}
        </p>
      ) : null}
      {props.error ? (
        <p
          id={`${props.id}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-xs text-danger"
        >
          <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

/** An input wired to its field's hint and error for assistive technology. */
export function TextInput(
  props: InputHTMLAttributes<HTMLInputElement> & {
    id: string;
    hasHint?: boolean;
    error?: string | undefined;
  },
) {
  const { hasHint, error, className = '', ...rest } = props;
  const described = [hasHint ? `${props.id}-hint` : '', error ? `${props.id}-error` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <input
      {...rest}
      aria-invalid={error ? true : undefined}
      aria-describedby={described || undefined}
      className={`${INPUT_CLASS} ${className}`}
    />
  );
}

const TONES = {
  info: { icon: Info, box: 'border-line bg-surface', text: 'text-muted' },
  good: { icon: Check, box: 'border-good bg-surface', text: 'text-good' },
  warn: { icon: TriangleAlert, box: 'border-attn bg-attn-soft', text: 'text-attn' },
  error: { icon: CircleAlert, box: 'border-danger bg-danger-soft', text: 'text-danger' },
} as const;

/** A result worth reading. `error` and `warn` interrupt a screen reader; `info` and `good` wait their turn. */
export function Notice(props: {
  tone: keyof typeof TONES;
  title: string;
  children?: ReactNode;
}) {
  const { icon: Icon, box, text } = TONES[props.tone];
  const urgent = props.tone === 'error' || props.tone === 'warn';

  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={`flex gap-3 rounded-xl border p-4 ${box}`}
    >
      <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${text}`} />
      <div className="grid min-w-0 gap-1 text-sm">
        <p className="font-medium">{props.title}</p>
        {props.children ? <div className="text-muted">{props.children}</div> : null}
      </div>
    </div>
  );
}
