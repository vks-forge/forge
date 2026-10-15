/**
 * ToggleGroup: a short row of mutually exclusive choices (range 7/30/90 days, run filters).
 *
 * Why: choosing one of three to five options should be one visible click, with the current
 *   choice readable without colour alone (the pressed option is filled and carries
 *   `aria-pressed`). Options are real buttons, so keyboard and screen readers work with no
 *   extra scripting, each is at least 44 px tall to tap, and the row wraps instead of
 *   scrolling on a phone.
 *
 * Exports: ToggleGroup.
 * Depends on: react.
 */

export function ToggleGroup<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div role="group" aria-label={props.label} className="flex flex-wrap gap-1">
      {props.options.map((option) => {
        const on = option.value === props.value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => props.onChange(option.value)}
            className={`min-h-11 rounded-lg px-3 text-sm font-medium transition-[background-color,color,transform] duration-150 active:translate-y-px sm:min-h-9 ${
              on ? 'bg-signal text-on-signal' : 'bg-hover text-muted hover:text-fg'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
