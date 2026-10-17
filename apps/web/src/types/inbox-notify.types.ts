/**
 * Types of the Inbox notifier: the browser-notification permission as the UI sees it.
 *
 * Why: a browser can lack notifications entirely, can have refused them, or can be waiting to
 *   be asked. The setting screen and the notifier must agree on those states, and the
 *   notifier must be testable without a real `Notification`, so both read them through one
 *   small shape.
 *
 * Exports: BrowserPermission.
 * Depends on: nothing. Types only.
 */

/** `Notification.permission`, plus `unsupported` for a browser that has no Notification API. */
export type BrowserPermission = 'unsupported' | 'default' | 'granted' | 'denied';
