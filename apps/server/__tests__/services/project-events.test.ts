/**
 * The project events hub.
 *
 * Why: every committed write reaches the open project streams through this emitter. A hub that
 *   delivered to the wrong project would leak card ids across projects, one that repeated a key
 *   would make the client refetch twice, one that let a broken stream throw into the writer
 *   would fail an owner's save, and one that kept a closed stream's listener would leak.
 *
 * Pins: delivery only to the project's listeners, key de-duplication, an empty list sends
 *   nothing, a throwing listener does not stop the others or the writer, unsubscribe stops
 *   delivery and frees the entry, nothing is replayed to a late subscriber.
 * Depends on: src/services/project-events, vitest. No IO.
 */

import { describe, expect, it, vi } from 'vitest';
import { createProjectEvents } from '#/services/project-events.js';

describe('createProjectEvents', () => {
  it('delivers keys to the listeners of that project only', () => {
    const events = createProjectEvents();
    const a = vi.fn();
    const b = vi.fn();
    events.subscribe('dcp', a);
    events.subscribe('other', b);

    events.invalidate('dcp', [['cards', 'dcp']]);

    expect(a).toHaveBeenCalledWith([['cards', 'dcp']]);
    expect(b).not.toHaveBeenCalled();
  });

  it('delivers each distinct key once and sends nothing for an empty list', () => {
    const events = createProjectEvents();
    const a = vi.fn();
    events.subscribe('dcp', a);

    events.invalidate('dcp', [
      ['card', 'DCP-C1'],
      ['cards', 'dcp'],
      ['card', 'DCP-C1'],
    ]);

    events.invalidate('dcp', []);

    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith([
      ['card', 'DCP-C1'],
      ['cards', 'dcp'],
    ]);
  });

  it('keeps delivering when one listener throws, and never throws into the writer', () => {
    const events = createProjectEvents();
    const after = vi.fn();
    events.subscribe('dcp', () => {
      throw new Error('stream closed');
    });

    events.subscribe('dcp', after);

    expect(() => events.invalidate('dcp', [['inbox', 'dcp']])).not.toThrow();
    expect(after).toHaveBeenCalledOnce();
  });

  it('stops delivering after unsubscribe and does not replay to a late subscriber', () => {
    const events = createProjectEvents();
    const a = vi.fn();
    const unsubscribe = events.subscribe('dcp', a);

    events.invalidate('dcp', [['cards', 'dcp']]);
    unsubscribe();
    unsubscribe();
    events.invalidate('dcp', [['cards', 'dcp']]);
    const late = vi.fn();
    events.subscribe('dcp', late);

    expect(a).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
  });

  it('lets a listener unsubscribe itself while being called', () => {
    const events = createProjectEvents();
    const calls: string[] = [];
    const off = events.subscribe('dcp', () => {
      calls.push('first');
      off();
    });

    events.subscribe('dcp', () => calls.push('second'));
    events.invalidate('dcp', [['cards', 'dcp']]);
    events.invalidate('dcp', [['cards', 'dcp']]);

    expect(calls).toEqual(['first', 'second', 'second']);
  });
});
