/**
 * ThemeToggle: cycles system, light and dark.
 *
 * Why: the app follows the OS by default, but people work at night on a bright OS setting or
 *   the reverse. One small control at the foot of the sidebar lets them override it. The
 *   icon shows the current mode and the accessible name says both where we are and what a
 *   press does ("Theme: system. Switch to light."), so the state is never colour or icon alone.
 *
 * Exports: ThemeToggle.
 * Depends on: lucide-react, components/ui/tooltip, domain/theme-mode, state/theme-provider.
 */

import { Monitor, Moon, Sun } from 'lucide-react';
import { Tooltip } from '#/components/ui/tooltip.js';
import { describeThemeMode } from '#/domain/theme-mode.js';
import { useTheme } from '#/state/theme-provider.js';

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

export function ThemeToggle() {
  const { mode, cycle } = useTheme();
  const Icon = ICONS[mode];

  return (
    <Tooltip content={describeThemeMode(mode)}>
      <button
        type="button"
        onClick={cycle}
        aria-label={describeThemeMode(mode)}
        className="grid size-9 place-items-center rounded-lg text-muted transition-[color,background-color,transform] duration-150 hover:bg-hover hover:text-fg active:translate-y-px"
      >
        <Icon aria-hidden="true" className="size-4" />
      </button>
    </Tooltip>
  );
}
