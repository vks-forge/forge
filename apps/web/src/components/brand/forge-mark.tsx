/**
 * The Forge crest (anvil and hammer) and the full logo (crest plus wordmark).
 *
 * Why: the sidebar, the mobile header and the setup wizard all show the product mark. One
 * component keeps its size, file and alt rule in one place, so the crest never drifts between
 * screens. The image is full colour on a transparent ground, so it sits on both themes as is:
 * no tint, no glow, no filter.
 *
 * Exports: ForgeMark, ForgeLogo.
 * Depends on: `/android-chrome-192x192.png` and `/forge-logo.png` in `apps/web/public`. No IO.
 */

/**
 * The crest at `size` px. Decorative (empty alt) by default because the word "Forge" sits next
 * to it; pass `named` when it stands alone so a screen reader still hears "Forge".
 */
export function ForgeMark(props: { size?: number; named?: boolean }) {
  const size = props.size ?? 24;

  return (
    <img
      src="/android-chrome-192x192.png"
      alt={props.named ? 'Forge' : ''}
      width={size}
      height={size}
      draggable={false}
      className="shrink-0 select-none"
    />
  );
}

/** Width-to-height ratio of `/forge-logo.png` (256 x 96). */
const LOGO_RATIO = 256 / 96;

/** The full logo, crest plus "Forge" wordmark, at `height` px; it carries the name itself. */
export function ForgeLogo(props: { height?: number }) {
  const height = props.height ?? 40;

  return (
    <img
      src="/forge-logo.png"
      alt="Forge"
      width={Math.round(height * LOGO_RATIO)}
      height={height}
      draggable={false}
      className="shrink-0 select-none"
    />
  );
}
