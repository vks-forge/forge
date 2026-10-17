/**
 * Pins: the desktop-notification switch asks the browser for permission only on the click that
 * turns it on (never on render), saves the choice per browser, turns off without asking, and
 * explains an unsupported or blocked browser with the switch disabled; blocked localStorage
 * does not break it.
 *
 * Why: browsers punish sites that ask for notification permission unprompted, and a switch
 *   that looks on while the browser refuses would silently drop the notifications the owner
 *   expects.
 * Depends on: components/settings/browser-notify-setting, state/notify-prefs. jsdom.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserNotifySetting } from '#/components/settings/browser-notify-setting.js';
import { notifyPrefsStore, setBrowserNotify } from '#/state/notify-prefs.js';

function stubNotification(permission: string, outcome = 'granted') {
  const request = vi.fn(() => Promise.resolve(outcome));

  vi.stubGlobal('Notification', { permission, requestPermission: request });

  return request;
}

const SWITCH = { name: 'Desktop notifications when this tab is hidden' };

beforeEach(() => setBrowserNotify(false));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BrowserNotifySetting', () => {
  it('does not ask for permission on render, only on the click that turns it on', async () => {
    const request = stubNotification('default');

    render(<BrowserNotifySetting />);

    expect(request).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('switch', SWITCH));

    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('switch', SWITCH)).toBeChecked();
    expect(notifyPrefsStore.getState().browser).toBe(true);
  });

  it('turns off without asking again', async () => {
    const request = stubNotification('granted');

    setBrowserNotify(true);
    render(<BrowserNotifySetting />);

    await userEvent.click(screen.getByRole('switch', SWITCH));

    expect(request).not.toHaveBeenCalled();
    expect(notifyPrefsStore.getState().browser).toBe(false);
  });

  it('stays off and explains how to re-enable when the user declines the prompt', async () => {
    stubNotification('default', 'denied');
    render(<BrowserNotifySetting />);

    await userEvent.click(screen.getByRole('switch', SWITCH));

    expect(notifyPrefsStore.getState().browser).toBe(false);
    expect(screen.getByRole('switch', SWITCH)).toBeDisabled();
    expect(screen.getByText(/blocked for Forge/)).toBeInTheDocument();
    expect(screen.getByText(/site settings/)).toBeInTheDocument();
  });

  it('is disabled with an explanation when permission was already denied', () => {
    stubNotification('denied');
    render(<BrowserNotifySetting />);

    expect(screen.getByRole('switch', SWITCH)).toBeDisabled();
    expect(screen.getByText(/blocked for Forge/)).toBeInTheDocument();
  });

  it('is disabled with an explanation in a browser without notifications', () => {
    vi.stubGlobal('Notification', undefined);
    render(<BrowserNotifySetting />);

    expect(screen.getByRole('switch', SWITCH)).toBeDisabled();
    expect(screen.getByText(/cannot show desktop notifications/)).toBeInTheDocument();
  });

  it('still works for this session when localStorage is blocked', async () => {
    stubNotification('default');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    render(<BrowserNotifySetting />);

    await userEvent.click(screen.getByRole('switch', SWITCH));

    expect(screen.getByRole('switch', SWITCH)).toBeChecked();
  });
});
