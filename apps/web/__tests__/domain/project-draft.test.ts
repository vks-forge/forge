/**
 * Pins: the new-project draft rules, the plain-language error table and the wizard's start step.
 *
 * Why: the form must catch what the server would refuse beside the right box, send exactly
 *   the strict body the server accepts (no empty folder for a check, the git setup or scope the
 *   folder needs and no host it does not have), and explain every refusal code with a fix. A wrong mapping here shows the wrong
 *   box in red, or a code instead of advice, at the moment someone is trying to finish setup.
 * Depends on: domain/project-draft, domain/create-project-errors, domain/wizard-steps.
 */

import type { ProjectInspection } from '@forge/core';
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
import { inspection, INSIDE_GIT, NONE_GIT } from '#tests/helpers/onboarding-fixtures.js';

const REPO = inspection() as ProjectInspection;

const REPO_REMOTE = inspection({
  git: {
    ...REPO.git,
    remote: {
      name: 'origin',
      url: 'https://github.com/acme/app.git',
      github: { owner: 'acme', repo: 'app' },
    },
  },
}) as ProjectInspection;

const GOOD: ProjectDraft = {
  ...EMPTY_DRAFT,
  slug: 'my-app',
  prefix: 'MA',
  baseBranch: 'main',
  checks: [{ name: 'test', role: 'test', command: 'npm run test' }],
};

describe('validateDraft', () => {
  it('accepts a complete local draft', () => {
    expect(validateDraft(GOOD, 'Vikash')).toEqual({});
  });

  it('points at each wrong field', () => {
    const problems = validateDraft(
      { ...GOOD, slug: 'My App', prefix: 'ma', baseBranch: ' ' },
      '',
    );

    expect(Object.keys(problems).sort()).toEqual([
      'base_branch',
      'form',
      'prefix',
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

  it('catches a name or prefix another project already uses', () => {
    const taken = { slugs: new Set(['my-app']), prefixes: new Set(['MA']) };

    const problems = validateDraft(GOOD, 'V', taken);

    expect(Object.keys(problems).sort()).toEqual(['prefix', 'slug']);
    expect(problems.slug).toMatch(/already exists/);
    expect(problems.prefix).toMatch(/already uses/);
    expect(validateDraft({ ...GOOD, slug: 'other', prefix: 'OT' }, 'V', taken)).toEqual(
      {},
    );
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
  it('sends a repository as is, drops an empty check folder and names no host', () => {
    const body = buildCreateRequest(
      ' /home/me/my-app ',
      { ...GOOD, checks: [{ name: 'test', role: 'test', command: 'npm t', cwd: '' }] },
      ' Vikash ',
      REPO,
    );

    expect(body).toEqual({
      slug: 'my-app',
      prefix: 'MA',
      local_path: '/home/me/my-app',
      base_branch: 'main',
      settings: { checks: [{ name: 'test', role: 'test', command: 'npm t' }] },
      author: 'Vikash',
      reason: 'project created in the web app',
    });
  });

  it('names a GitHub connection, never a host', () => {
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
      REPO,
    );

    expect(body).toMatchObject({
      connection_id: 'acme',
      repo_full_name: 'acme/app',
      installation_id: '99',
    });

    expect(body).not.toHaveProperty('git_host');
  });

  it('sends the git setup the person chose for a folder with no repository', () => {
    const none = inspection({ git: NONE_GIT }) as ProjectInspection;

    expect(buildCreateRequest('/r', GOOD, 'V', none)).toMatchObject({
      git_setup: { mode: 'snapshot' },
    });

    const body = buildCreateRequest('/r', { ...GOOD, gitSetup: 'init_only' }, 'V', none);

    expect(body).toMatchObject({ git_setup: { mode: 'init_only' } });
    expect(body).not.toHaveProperty('scope');
  });

  it('registers the repository top for scope root and the chosen folder for a subfolder', () => {
    const inside = inspection({ git: INSIDE_GIT }) as ProjectInspection;

    const root = buildCreateRequest('/code/mono/apps/billing', GOOD, 'V', inside);
    const sub = buildCreateRequest(
      '/code/mono/apps/billing',
      { ...GOOD, scope: 'subfolder' },
      'V',
      inside,
    );

    expect(root).toMatchObject({ local_path: '/code/mono', scope: { mode: 'root' } });
    expect(sub).toMatchObject({
      local_path: '/code/mono/apps/billing',
      scope: { mode: 'subfolder' },
    });

    expect(root).not.toHaveProperty('git_setup');
  });
});

describe('draftFromInspection', () => {
  it('takes the suggestions and resets the git choices to the recommended ones', () => {
    const draft = draftFromInspection(
      inspection({
        base_branch: 'develop',
        branches: ['develop', 'main'],
        suggested_slug: 'r',
        suggested_prefix: 'R',
      }) as ProjectInspection,
      { ...EMPTY_DRAFT, gitSetup: 'init_only', scope: 'subfolder' },
    );

    expect(draft).toMatchObject({
      slug: 'r',
      prefix: 'R',
      baseBranch: 'develop',
      host: 'local',
      gitSetup: 'snapshot',
      scope: 'root',
    });

    expect(draft.checks).toHaveLength(1);
  });

  it('keeps a GitHub choice only when the folder has a GitHub remote', () => {
    const kept = draftFromInspection(REPO_REMOTE, { ...EMPTY_DRAFT, host: 'github' });
    const dropped = draftFromInspection(REPO, { ...EMPTY_DRAFT, host: 'github' });

    expect(kept).toMatchObject({ host: 'github', repo: 'acme/app' });
    expect(dropped).toMatchObject({ host: 'local', repo: '' });
  });
});

describe('explainCreateError', () => {
  const refused = (code: string, message = 'the server explains here') =>
    new ApiError('http', message, { status: 400, code });

  it.each([
    ['invalid_local_path', 'local_path'],
    ['path_in_data_home', 'local_path'],
    ['not_a_directory', 'local_path'],
    ['path_in_use', 'local_path'],
    ['base_branch_missing', 'base_branch'],
    ['project_exists', 'slug'],
    ['prefix_in_use', 'prefix'],
    ['connection_not_found', 'connection'],
    ['connection_disabled', 'connection'],
    ['invalid_settings', 'checks'],
    ['invalid_request', 'form'],
    ['memory_init_failed', 'form'],
    ['snapshot_too_large', 'form'],
  ])('puts %s on the %s field with a fix', (code, field) => {
    const problem = explainCreateError(refused(code));

    expect(problem.field).toBe(field);
    expect(problem.message.length).toBeGreaterThan(5);
    expect(problem.fix.length).toBeGreaterThan(5);
  });

  it('puts project_not_servable on the form for local and on the repository for GitHub', () => {
    expect(explainCreateError(refused('project_not_servable'), 'local').field).toBe(
      'form',
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
    expect(startStep(fresh, null)).toBe('harness');
    expect(startStep({ first_run: { ...fresh.first_run, harness_ok: true } }, null)).toBe(
      'github',
    );

    expect(startStep(fresh, 'project')).toBe('project');
  });

  it('stops at either end', () => {
    expect(neighbour('harness', -1)).toBe('harness');
    expect(neighbour('project', 1)).toBe('project');
    expect(neighbour('harness', 1)).toBe('github');
  });
});
