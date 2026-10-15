/**
 * Pins: the new-project draft rules, the plain-language error table and the wizard's start step.
 *
 * Why: the form must catch what the server would refuse beside the right box, send exactly
 *   the strict body the server accepts (no empty folder for a check, one way to name the git
 *   host), and explain every refusal code with a fix. A wrong mapping here shows the wrong
 *   box in red, or a code instead of advice, at the moment someone is trying to finish setup.
 * Depends on: domain/project-draft, domain/create-project-errors, domain/wizard-steps.
 */

import { describe, expect, it } from 'vitest';
import { ApiError } from '#/api/api-error.js';
import { explainCreateError } from '#/domain/create-project-errors.js';
import {
  buildCreateRequest,
  draftFromInspection,
  EMPTY_DRAFT,
  validateDraft,
} from '#/domain/project-draft.js';
import { neighbour, startStep } from '#/domain/wizard-steps.js';
import type { ProjectDraft } from '#/types/onboarding.types.js';

const GOOD: ProjectDraft = {
  ...EMPTY_DRAFT,
  slug: 'my-app',
  prefix: 'MA',
  baseBranch: 'main',
  remotePath: '../my-app.git',
  checks: [{ name: 'test', role: 'test', command: 'npm run test' }],
};

describe('validateDraft', () => {
  it('accepts a complete local draft', () => {
    expect(validateDraft(GOOD, 'Vikash')).toEqual({});
  });

  it('points at each wrong field', () => {
    const problems = validateDraft(
      { ...GOOD, slug: 'My App', prefix: 'ma', baseBranch: ' ', remotePath: '' },
      '',
    );

    expect(Object.keys(problems).sort()).toEqual([
      'base_branch',
      'form',
      'prefix',
      'remote_path',
      'slug',
    ]);
  });

  it('asks for the GitHub fields only when GitHub is chosen', () => {
    const problems = validateDraft(
      { ...GOOD, host: 'github', repo: 'nope', installationId: 'x' },
      'V',
    );

    expect(Object.keys(problems).sort()).toEqual([
      'connection',
      'installation_id',
      'repo',
    ]);
  });

  it('refuses a blank or repeated check', () => {
    const blank = validateDraft(
      { ...GOOD, checks: [{ name: 'x', role: 'test', command: ' ' }] },
      'V',
    );

    const twice = validateDraft(
      {
        ...GOOD,
        checks: [
          { name: 'a', role: 'test', command: 'x' },
          { name: 'a', role: 'lint', command: 'y' },
        ],
      },
      'V',
    );

    expect(blank.checks).toMatch(/name and a command/);
    expect(twice.checks).toMatch(/different/);
  });
});

describe('buildCreateRequest', () => {
  it('names a local host and drops an empty check folder', () => {
    const body = buildCreateRequest(
      ' /home/me/my-app ',
      { ...GOOD, checks: [{ name: 'test', role: 'test', command: 'npm t', cwd: '' }] },
      ' Vikash ',
    );

    expect(body).toEqual({
      slug: 'my-app',
      prefix: 'MA',
      local_path: '/home/me/my-app',
      base_branch: 'main',
      git_host: { kind: 'local', remote_path: '../my-app.git', base_branch: 'main' },
      settings: { checks: [{ name: 'test', role: 'test', command: 'npm t' }] },
      author: 'Vikash',
      reason: 'project created in the web app',
    });
  });

  it('names a GitHub connection instead of a host, never both', () => {
    const body = buildCreateRequest(
      '/r',
      {
        ...GOOD,
        host: 'github',
        connectionId: 'acme',
        repo: 'acme/app',
        installationId: '99',
      },
      'V',
    );

    expect(body).toMatchObject({
      connection_id: 'acme',
      repo_full_name: 'acme/app',
      installation_id: '99',
    });

    expect(body).not.toHaveProperty('git_host');
  });
});

describe('draftFromInspection', () => {
  it('takes the suggestions and keeps the host the user chose', () => {
    const draft = draftFromInspection(
      {
        local_path: '/r',
        current_branch: 'main',
        base_branch: 'develop',
        branches: ['develop', 'main'],
        branches_truncated: false,
        ecosystems: ['node'],
        checks: [{ name: 'test', role: 'test', command: 'npm run test' }],
        suggested_slug: 'r',
        suggested_prefix: 'R',
      },
      { ...EMPTY_DRAFT, host: 'github', repo: 'a/b' },
    );

    expect(draft).toMatchObject({
      slug: 'r',
      prefix: 'R',
      baseBranch: 'develop',
      host: 'github',
      repo: 'a/b',
    });

    expect(draft.checks).toHaveLength(1);
  });
});

describe('explainCreateError', () => {
  const refused = (code: string, message = 'the server explains here') =>
    new ApiError('http', message, { status: 400, code });

  it.each([
    ['invalid_local_path', 'local_path'],
    ['path_in_data_home', 'local_path'],
    ['not_a_directory', 'local_path'],
    ['not_a_repository', 'local_path'],
    ['not_repository_root', 'local_path'],
    ['path_in_use', 'local_path'],
    ['base_branch_missing', 'base_branch'],
    ['project_exists', 'slug'],
    ['prefix_in_use', 'prefix'],
    ['connection_not_found', 'connection'],
    ['connection_disabled', 'connection'],
    ['invalid_settings', 'checks'],
    ['invalid_request', 'form'],
    ['memory_init_failed', 'form'],
  ])('puts %s on the %s field with a fix', (code, field) => {
    const problem = explainCreateError(refused(code));

    expect(problem.field).toBe(field);
    expect(problem.message.length).toBeGreaterThan(5);
    expect(problem.fix.length).toBeGreaterThan(5);
  });

  it('puts project_not_servable on the remote for local and on the repository for GitHub', () => {
    expect(explainCreateError(refused('project_not_servable'), 'local').field).toBe(
      'remote_path',
    );

    expect(explainCreateError(refused('project_not_servable'), 'github').field).toBe(
      'repo',
    );
  });

  it('says a repository with no commits needs one', () => {
    const problem = explainCreateError(
      refused('base_branch_missing', 'x has no commits yet; make a first commit'),
    );

    expect(problem.message).toMatch(/no commits/);
  });

  it('falls back to the connection wording for an unknown error', () => {
    const problem = explainCreateError(new ApiError('network', 'down'));

    expect(problem).toMatchObject({ field: 'form', message: 'Cannot reach Forge' });
  });
});

describe('wizard steps', () => {
  const fresh = { first_run: { complete: false, project_count: 0, harness_ok: false } };

  it('opens at the first step, past the harness once one works, or where the user was', () => {
    expect(startStep(fresh, null)).toBe('data');
    expect(startStep({ first_run: { ...fresh.first_run, harness_ok: true } }, null)).toBe(
      'github',
    );

    expect(startStep(fresh, 'project')).toBe('project');
  });

  it('stops at either end', () => {
    expect(neighbour('data', -1)).toBe('data');
    expect(neighbour('project', 1)).toBe('project');
    expect(neighbour('harness', 1)).toBe('github');
  });
});
