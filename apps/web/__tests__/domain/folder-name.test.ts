/**
 * Pins: the new-folder name rules shown beside the box before the server is asked.
 *
 * Why: the server refuses names that escape the parent, Windows reserved names and trailing
 * dots or spaces. Saying so while the person types, in plain words, saves a round trip, and
 * a good name must never be refused here.
 * Depends on: domain/folder-name.
 */

import { describe, expect, it } from 'vitest';
import { folderNameProblem } from '#/domain/folder-name.js';

describe('folderNameProblem', () => {
  it.each(['my-app', 'App 2', 'v1.2'])('accepts %j', (name) => {
    expect(folderNameProblem(name, [])).toBeNull();
  });

  it.each([
    '',
    '   ',
    'a/b',
    'a\\b',
    'x:y',
    '..',
    '.',
    'CON',
    'com1.txt',
    'end.',
    'end ',
    ' lead',
  ])('refuses %j', (name) => {
    expect(folderNameProblem(name, [])).not.toBeNull();
  });

  it('refuses a name already there, ignoring case', () => {
    expect(folderNameProblem('notes', ['Notes'])).toMatch(/already exists/);
  });

  it('refuses a name over 120 characters', () => {
    expect(folderNameProblem('a'.repeat(121), [])).toMatch(/120/);
  });
});
