/**
 * ChartLegend: the colour key under a chart, one swatch and one name per series.
 *
 * Why: a stacked chart is unreadable without saying which colour is which project, and
 *   colour alone is not enough: every swatch sits beside its written name, so the key works
 *   for people who cannot tell the hues apart. The row wraps rather than scrolling, so it
 *   fits a 375 px phone.
 *
 * Exports: ChartLegend.
 * Depends on: react.
 */

export function ChartLegend(props: {
  items: readonly { key: string; label: string; color: string }[];
}) {
  if (props.items.length < 2) {
    return null;
  }

  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {props.items.map((item) => (
        <li key={item.key} className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span className="truncate">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
