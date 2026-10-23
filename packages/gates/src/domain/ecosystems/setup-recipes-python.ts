/**
 * Setup recipes for Python: uv, Poetry, Pipenv, pip with requirements, pip with pyproject.
 *
 * Why: Python is the one ecosystem whose install is a project-local virtual environment, which is
 *   created, found on PATH and (deliberately) never copied between worktrees because it holds
 *   absolute paths. Its rows share the environment folder names and the venv-creating step, and
 *   are kept apart from the table so the table stays readable (d-0176). Only download caches are
 *   shared (`cache_env`); no row has `cache_outputs`.
 *
 * Exports: PYTHON_RECIPES.
 * Depends on: types/setup. No IO.
 */

import type { SetupRecipe } from '#/types/setup.types.js';

/** A project-local virtual environment's executables, whichever platform created it. */
const VENV_PATH = ['.venv/Scripts', '.venv/bin'];

const VENV_STEP = {
  name: 'Create virtual environment',
  command: 'python -m venv .venv',
  path: VENV_PATH,
};

/** Python rows in run order; the first row whose markers match wins (`fallback` rows last). */
export const PYTHON_RECIPES: readonly SetupRecipe[] = [
  {
    ecosystem: 'python',
    id: 'uv',
    any: ['uv.lock'],
    steps: [
      {
        name: 'Install Python packages',
        command: 'uv sync --frozen',
        cache_env: { UV_CACHE_DIR: 'python/uv' },
        inputs: ['uv.lock', 'pyproject.toml'],
        path: VENV_PATH,
      },
    ],
  },
  {
    ecosystem: 'python',
    id: 'poetry',
    any: ['poetry.lock'],
    steps: [
      {
        name: 'Install Python packages',
        command: 'poetry install --no-interaction',
        env: { POETRY_VIRTUALENVS_IN_PROJECT: 'true' },
        cache_env: { POETRY_CACHE_DIR: 'python/poetry', PIP_CACHE_DIR: 'python/pip' },
        inputs: ['poetry.lock', 'pyproject.toml'],
        path: VENV_PATH,
      },
    ],
  },
  {
    ecosystem: 'python',
    id: 'pipenv',
    any: ['Pipfile.lock'],
    steps: [
      {
        name: 'Install Python packages',
        command: 'pipenv sync',
        env: { PIPENV_VENV_IN_PROJECT: '1' },
        cache_env: { PIPENV_CACHE_DIR: 'python/pipenv', PIP_CACHE_DIR: 'python/pip' },
        inputs: ['Pipfile', 'Pipfile.lock'],
        path: VENV_PATH,
      },
    ],
  },
  {
    ecosystem: 'python',
    id: 'pip-requirements',
    any: ['requirements.txt'],
    steps: [
      VENV_STEP,
      {
        name: 'Install Python packages',
        command: 'python -m pip install -r requirements.txt',
        cache_env: { PIP_CACHE_DIR: 'python/pip' },
        inputs: ['requirements*.txt'],
        path: VENV_PATH,
      },
    ],
  },
  {
    ecosystem: 'python',
    id: 'pip-pyproject',
    any: ['pyproject.toml'],
    fallback: true,
    steps: [
      VENV_STEP,
      {
        name: 'Install Python packages',
        command: 'python -m pip install -e .',
        cache_env: { PIP_CACHE_DIR: 'python/pip' },
        inputs: ['pyproject.toml'],
        path: VENV_PATH,
      },
    ],
  },
];
