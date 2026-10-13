/**
 * Types for the shell tokenizer.
 *
 * Why: call-time rules match each simple command of a shell line independently, so the
 *   tokenizer's output must be a precise list of segments that carries, besides argv,
 *   every construct that makes a command riskier than its text suggests (substitution,
 *   wrappers, interpreter eval, redirect targets). Naming those once keeps the tokenizer
 *   and the rule evaluator agreeing on what "needs a human" means (tool-system.md §5.2).
 *
 * Exports: ShellDialect, ShellFlag, ShellRedirect, ShellSegment, TokenizeFailure, NestedScript,
 *   QuoteHost, RedirectScan.
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

/** A command string an interpreter will run; `dialect` is `null` for non-shell code. */
export interface NestedScript {
  readonly text: string;
  /** `null` when the text is not shell (python, node ...): scan loosely, do not tokenise. */
  readonly dialect: ShellDialect | null;
}

/**
 * What a quote or substitution scanner may do to the word being built; the tokenizer
 * owns the state, the scanners only append text and request nested parsing.
 */
export interface QuoteHost {
  readonly src: string;
  /** True for the PowerShell dialect (doubled-quote and backtick escapes). */
  readonly ps: boolean;
  /** Parses `body` from `from` as a nested sequence; returns the index after it. */
  sub(body: string, from: number, closeParen: boolean): number;
  /** Adds literal text to the word under construction. */
  append(text: string): void;
  /** Marks the current word as present even if empty (`""`). */
  markStarted(): void;
}

/** Where a redirect operator ends and what it redirects to, if it names a file. */
export interface RedirectScan {
  readonly next: number;
  /** `null` for fd duplication (`2>&1`, `<&3`), which names no file. */
  readonly mode: 'read' | 'write' | null;
}
