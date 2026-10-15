/**
 * Vitest setup for the web app's jsdom tests.
 *
 * Why: jsdom lacks a few browser APIs the UI relies on (media queries, pointer capture,
 *   ResizeObserver, scrollIntoView), and real spring animations would make every test wait on
 *   the clock. This file adds minimal stand-ins, makes motion finish instantly, and cleans the
 *   DOM and storage between tests so one test's theme or remembered project never leaks into
 *   the next.
 *
 * Exports: nothing (registers global hooks).
 * Depends on: vitest, @testing-library/react, @testing-library/jest-dom, motion/react,
 *   helpers/match-media.
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach } from 'vitest';
import { resetUiState } from '#/state/ui-store.js';
import { setMatchMedia } from '#tests/helpers/match-media.js';

MotionGlobalConfig.skipAnimations = true;
// A loaded machine (coverage, parallel workers) can take longer than the 1 s default.
configure({ asyncUtilTimeout: 5000 });

// Radix menus and dialogs call these; jsdom does not implement them.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

beforeEach(() => {
  setMatchMedia();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  cleanup();
  resetUiState();
});
