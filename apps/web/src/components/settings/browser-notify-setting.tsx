/**
 * BrowserNotifySetting: the switch for desktop notifications about new Inbox items.
 *
 * Why: a toast is only seen while the Forge tab is in front. Owners who work elsewhere want a
 *   desktop notification when Forge needs them, but browsers punish sites that ask for that
 *   permission on load, so it is requested only on the click that turns this on. The control
 *   says plainly when the browser cannot do it, or when the owner already refused in the
 *   browser (which only the browser's site settings can undo), and the switch then stays off
 *   instead of looking enabled while doing nothing. The choice is per browser.
 *
 * Exports: BrowserNotifySetting.
 * Depends on: react, components/settings/settings-page, components/settings/form-field,
 *   components/ui/field, api/use-inbox-notifier (browserPermission), state/notify-prefs.
 */

import { useState } from 'react';
import { browserPermission } from '#/api/use-inbox-notifier.js';
import { Notice } from '#/components/settings/form-field.js';
import { SettingsSection } from '#/components/settings/settings-page.js';
import { Switch } from '#/components/ui/field.js';
import { setBrowserNotify, useBrowserNotifyEnabled } from '#/state/notify-prefs.js';
import type { BrowserPermission } from '#/types/inbox-notify.types.js';

const LABEL = 'Desktop notifications when this tab is hidden';

export function BrowserNotifySetting() {
  const wanted = useBrowserNotifyEnabled();
  const [permission, setPermission] = useState<BrowserPermission>(browserPermission);
  const blocked = permission === 'unsupported' || permission === 'denied';
  const on = wanted && permission === 'granted';

  async function toggle(next: boolean): Promise<void> {
    if (!next) {
      setBrowserNotify(false);

      return;
    }

    if (blocked) {
      return;
    }

    let result: BrowserPermission = permission;

    if (permission === 'default') {
      try {
        result = await Notification.requestPermission();
      } catch {
        result = 'denied';
      }

      setPermission(result);
    }

    setBrowserNotify(result === 'granted');
  }

  return (
    <SettingsSection
      id="notifications"
      title="Notifications"
      description="How Forge tells you something is waiting in the Inbox. Saved in this browser only."
    >
      <div className="flex items-start gap-3">
        <Switch
          checked={on}
          label={LABEL}
          disabled={blocked}
          onChange={(next) => void toggle(next)}
        />
        <div className="grid gap-0.5">
          <p className="text-sm font-medium">{LABEL}</p>
          <p className="text-xs text-muted">
            New items always appear as a toast inside Forge. This adds a desktop
            notification when you are in another tab or window. The browser asks for
            permission when you turn this on.
          </p>
        </div>
      </div>
      {permission === 'unsupported' ? (
        <Notice tone="info" title="This browser cannot show desktop notifications">
          Forge keeps using in-app toasts and the count in the tab title.
        </Notice>
      ) : null}
      {permission === 'denied' ? (
        <Notice tone="warn" title="Notifications are blocked for Forge">
          To turn them on, allow notifications for this site in your browser's site
          settings (the icon beside the address), then reload this page.
        </Notice>
      ) : null}
    </SettingsSection>
  );
}
