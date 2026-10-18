/**
 * Fixtures for the importer tests: a decision file, twelve statements strict YAML rejects and a repository of forty.
 *
 * Why: the importer is tested on small real git repositories, several files of them, and each needs the same
 *   hand-written record files. The twelve statements are the shapes that make strict YAML fail or silently cut
 *   the text (a colon, a backtick, a `#`, a brace, a bracket, a star, an ampersand, an at sign, quotes then a
 *   colon, a percent, a dash), so a repository of forty records with twelve of them is the realistic worst case.
 *
 * Exports: decision(), FAILING, forty().
 * Depends on: nothing. Pure, no IO.
 */

export const decision = (
  n: number,
  statement: string,
  extra: string[] = [],
): [string, string] => {
  const id = `d-${String(n).padStart(4, '0')}`;

  return [
    `decisions/${id}-x.md`,
    [
      '---',
      `id: ${id}`,
      'kind: decision',
      `statement: ${statement}`,
      'source: { type: chat, ref: owner }',
      'author: user',
      'origin: owner',
      'status: active',
      'valid_from: 2026-10-12',
      'tags: [alpha, beta]',
      'pinned: true',
      ...extra,
      '---',
      `Body of ${id}.`,
      '',
    ].join('\n'),
  ];
};

/** Twelve statements strict YAML cannot take as written. */
export const FAILING = [
  'Skills improve: the factory watches outcomes.',
  '`forge` is the one CLI.',
  'Use the #1 pick, not # 2.',
  '#hashtags are not keys.',
  '{placeholder} is reserved.',
  '[tag] prefixes are not ids.',
  '*bold* is not rendered.',
  '&anchors stay in text.',
  '@scope/pkg keeps its at sign.',
  'He said "yes": settled.',
  '100% of gates run: no skips.',
  '- not a list: a dash.',
];

export const forty = (): Record<string, string> => {
  const files: Record<string, string> = {};
  for (let i = 1; i <= 28; i += 1) {
    const [path, text] = decision(i, `Clean statement number ${i}`);
    files[path] = text;
  }

  FAILING.forEach((statement, i) => {
    const [path, text] = decision(29 + i, statement, [
      i === 0 ? 'supersedes: d-0001' : 'amends: d-0002',
    ]);

    files[path] = text;
  });

  return files;
};
