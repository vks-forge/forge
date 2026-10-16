/**
 * Pins: the notification store through `notifyStore`, with no React: tone helpers, replace-by-id, in-place update, dismiss, promise and task handles.
 *
 * Why: errors and job results are raised from mutation callbacks and polls outside any component
 *   and must land in the same stack; the same id must replace instead of stacking, and a
 *   finished task must be reported even if the user closed its progress card.
 * Depends on: state/notify/notify-store.
 */

import { describe, expect, it } from 'vitest';
import { notifyStore, useNotifyStore } from '#/state/notify/notify-store.js';

const items = () => useNotifyStore.getState().items;

describe('notifyStore', () => {
  it('adds one item per call, with the tone helpers setting the tone', () => {
    notifyStore.success('a');
    notifyStore.error('b');
    notifyStore.info('c');
    notifyStore.warning('d');
    notifyStore.loading('e');

    expect(items().map((i) => i.tone)).toEqual([
      'success',
      'error',
      'info',
      'warning',
      'loading',
    ]);
  });

  it('replaces a notification with the same id instead of stacking', () => {
    notifyStore.success('Saved', { id: 'save' });
    notifyStore.success('Saved again', { id: 'save' });

    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ title: 'Saved again', revision: 2 });
  });

  it('updates in place, keeping the position and giving a new tone its own lifetime', () => {
    notifyStore.loading('Working', { id: 'job', duration: null });
    notifyStore.info('other');
    notifyStore.update('job', { tone: 'success', title: 'Done' });

    expect(items()[0]).toMatchObject({
      id: 'job',
      tone: 'success',
      title: 'Done',
      duration: undefined,
    });
  });

  it('ignores an update to a notification that is gone', () => {
    notifyStore.update('missing', { title: 'x' });

    expect(items()).toHaveLength(0);
  });

  it('dismisses one by id, or everything without an id', () => {
    notifyStore.success('a', { id: 'a' });
    notifyStore.success('b', { id: 'b' });
    notifyStore.dismiss('a');

    expect(items().map((i) => i.id)).toEqual(['b']);

    notifyStore.dismiss();

    expect(items()).toHaveLength(0);
  });

  it('resolves a promise into success and returns the same promise', async () => {
    const returned = notifyStore.promise(Promise.resolve(3), {
      id: 'p',
      loading: 'Saving',
      success: (n) => `Saved ${n}`,
      error: 'Failed',
    });

    expect(items()[0]).toMatchObject({ tone: 'loading', title: 'Saving' });
    await expect(returned).resolves.toBe(3);
    await Promise.resolve();

    expect(items()[0]).toMatchObject({ tone: 'success', title: 'Saved 3' });
  });

  it('turns a rejected promise into an error and still rejects for the caller', async () => {
    const failure = new Error('boom');
    const returned = notifyStore.promise(Promise.reject(failure), {
      id: 'p',
      loading: 'Saving',
      success: 'Saved',
      error: (e) => `Failed: ${(e as Error).message}`,
    });

    await expect(returned).rejects.toBe(failure);
    await Promise.resolve();

    expect(items()[0]).toMatchObject({ tone: 'error', title: 'Failed: boom' });
  });
});

describe('notifyStore.task', () => {
  it('shows a running task and merges live updates', () => {
    const task = notifyStore.task({
      id: 'compat',
      title: 'Checking',
      progress: { value: 1, max: 7 },
    });

    task.update({ progress: { value: 3, max: 7 }, description: 'Third check' });

    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({
      task: true,
      tone: 'loading',
      progress: { value: 3, max: 7 },
      description: 'Third check',
    });
  });

  it('is idempotent by id', () => {
    notifyStore.task({ id: 'compat', title: 'Checking' });
    notifyStore.task({ id: 'compat', title: 'Checking' });

    expect(items()).toHaveLength(1);
  });

  it('succeed turns it into a success without progress or cancel', () => {
    const task = notifyStore.task({
      id: 'j',
      title: 'Checking',
      progress: {},
      onCancel: () => undefined,
    });

    task.succeed('All checks passed');

    expect(items()[0]).toMatchObject({ tone: 'success', title: 'All checks passed' });
    expect(items()[0]?.progress).toBeUndefined();
    expect(items()[0]?.onCancel).toBeUndefined();
  });

  it('fail turns it into an error that keeps its steps', () => {
    const steps = [{ label: 'Docker', status: 'fail' as const }];
    const task = notifyStore.task({ id: 'j', title: 'Checking', steps });

    task.fail('A check failed');

    expect(items()[0]).toMatchObject({ tone: 'error', title: 'A check failed', steps });
  });

  it('reports the outcome even if the user closed the progress card', () => {
    const task = notifyStore.task({ id: 'j', title: 'Checking' });

    task.dismiss();
    task.fail('A check failed');

    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ tone: 'error' });
  });
});
