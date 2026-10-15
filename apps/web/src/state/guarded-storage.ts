/**
 * `guardedLocalStorage`: `localStorage` that never throws.
 *
 * Why: browsers block storage in some private modes, a full disk makes `setItem` throw, and a
 *   locked-down profile can throw on the mere mention of `localStorage`. UI preferences are a
 *   convenience, so none of that may crash the app: a failed read means "nothing saved" (the
 *   store keeps its defaults) and a failed write means the choice lasts for this tab only.
 *
 * Exports: guardedLocalStorage.
 * Depends on: zustand/middleware (StateStorage type). IO: localStorage.
 */

import type { StateStorage } from 'zustand/middleware';

export const guardedLocalStorage: StateStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // The choice still applies for this session.
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to remove if storage is unreachable.
    }
  },
};
