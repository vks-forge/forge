/**
 * Types of project detection: what the detector reads and what it suggests.
 *
 * Why: the new-project form shows these suggestions before anything is saved; typed shapes
 *   keep the server route from guessing at the detector's output.
 *
 * Exports: DetectionInput, DetectedProject.
 * Depends on: @forge/core (ProjectCheck, types only).
 */

import type { ProjectCheck } from '@forge/core';

export interface DetectionInput {
  /** File and folder names at the repository root (no paths). */
  readonly rootEntries: readonly string[];
  /** The parsed root `package.json`, when there is one. */
  readonly packageJson?: unknown;
}

export interface DetectedProject {
  /** Ecosystem ids whose marker files sit at the root, in registry order. */
  readonly ecosystems: readonly string[];
  /** Suggested checks, in the order they should run. */
  readonly checks: readonly ProjectCheck[];
}
