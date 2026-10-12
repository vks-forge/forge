/**
 * Types for the shell tokenizer.
 *
 * Why: call-time rules match each simple command of a shell line independently, so the
 *   tokenizer's output must be a precise list of segments that carries, besides argv,
 *   every construct that makes a command riskier than its text suggests (substitution,
 *   wrappers, interpreter eval, redirect targets). Naming those once keeps the tokenizer
 *   and the rule evaluator agreeing on what "needs a human" means (tool-system.md §5.2).
 *
 * Exports: ShellDialect, ShellFlag, ShellRedirect, ShellSegment, TokenizeFailure.
 * Depends on: No IO (types only).
 */

/** Which shell tool produced the command; the two quote and escape differently. */
export type ShellDialect = 'bash' | 'powershell';

/** Constructs that force at least an `ask` however the command text matches a rule. */
export type ShellFlag =
  'subshell' | 'wrapper' | 'interpreter_eval' | 'pipe_to_interpreter' | 'background';

/** A redirect target; `write` targets are evaluated as file writes, `read` as reads. */
export interface ShellRedirect {
  readonly mode: 'read' | 'write';
  readonly target: string;
}

/** One simple command of a shell line, after quote removal. */
export interface ShellSegment {
  readonly argv: readonly string[];
  /** `argv` joined by single spaces: what call-time rules match against. */
  readonly text: string;
  /** Same with the command name reduced to its bare, `.exe`-less form (floor matching). */
  readonly baseText: string;
  readonly assignments: readonly string[];
  readonly redirects: readonly ShellRedirect[];
  readonly flags: readonly ShellFlag[];
  /** True when the segment came from inside `$(...)` or backticks. */
  readonly nested: boolean;
}

/** Why a command could not be turned into segments. Both deny. */
export type TokenizeFailure = 'untokenizable' | 'dynamic_execution';
