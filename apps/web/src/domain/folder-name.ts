/**
 * Checks a new folder's name before it is sent, with the server's rules in plain words.
 *
 * Why: a name typed into the browser's "New folder" row is refused by the server when it
 *   could escape the parent, clash with a Windows reserved name or end in a dot or space.
 *   Telling the person while they type, beside the box, saves a round trip; the server still
 *   re-checks. A name already in the list is caught here too. Pure, no IO.
 *
 * Exports: folderNameProblem().
 * Depends on: none. No IO.
 */

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/;

/** What is wrong with `name` as a new folder name, or null when it is fine. `existing` are the sibling names. */
export function folderNameProblem(
  name: string,
  existing: readonly string[],
): string | null {
  if (name.trim() === '') {
    return 'Give the folder a name.';
  }

  if (name.length > 120) {
    return 'Use 120 characters or fewer.';
  }

  if (name === '.' || name === '..' || FORBIDDEN.test(name)) {
    return 'A folder name cannot contain \\ / : * ? " < > | or be . or ..';
  }

  if (RESERVED.test(name)) {
    return `${name} is a reserved name on Windows; choose another.`;
  }

  if (/[. ]$/.test(name) || name.startsWith(' ')) {
    return 'A folder name cannot start with a space or end with a space or dot.';
  }

  if (existing.some((e) => e.toLowerCase() === name.toLowerCase())) {
    return `${name} already exists here.`;
  }

  return null;
}
