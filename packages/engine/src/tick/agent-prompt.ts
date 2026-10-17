/**
 * Puts together the prompt a Worker is started with.
 *
 * Why: the Worker's prompt has three parts with three different owners. The brief is what the
 *   Director wrote for this ticket. The instructions are the owner's words about how this agent
 *   works (an agent's instructions, empty for the built-in implementer). The rules are facts
 *   about the environment (shell limits, how to finish) and must come last and verbatim, so
 *   neither the brief nor the agent can paraphrase them away. An agent with no instructions adds
 *   no section, so a run on the built-in implementer is byte-identical to a run before agents.
 *
 * Exports: workerPrompt().
 * Depends on: nothing. No IO.
 */

/** The brief, then the agent's instructions under their own heading when there are any, then the rules. */
export function workerPrompt(brief: string, instructions: string, rules: string): string {
  const own = instructions.trim();

  return [brief, own === '' ? null : `## Agent instructions\n${own}`, rules]
    .filter((part) => part !== null)
    .join('\n\n');
}
