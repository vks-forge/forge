/**
 * Sign-in codes and browser sessions: single use, short life, bounded tables.
 *
 * Why: the one-time code is the only thing that turns "a person at this machine ran
 *   `forge open`" into a browser cookie. If a code could be used twice, outlive its minute,
 *   or be guessed against a growing pile, a leaked link or a hostile local program would
 *   get a session with the power to start Workers. A session that never expired, or that
 *   survived logout, would do the same with a stolen cookie.
 *
 * Pins: a good code opens once and replays fail; wrong, empty and oversized codes fail and
 *   leave other codes alone; expiry at 60 s; idle expiry slides, hard expiry does not; revoke
 *   works; tables are capped by dropping the oldest; cookie attributes and parsing.
 * Depends on: src/services/auth/{sessions,cookies}. No IO.
 */

import { describe, expect, it } from 'vitest';
import {
  clearedSessionCookie,
  sessionCookie,
  sessionIdOf,
} from '#/services/auth/cookies.js';
import {
  CODE_TTL_SECONDS,
  MAX_OPEN_CODES,
  MAX_SESSIONS,
  SESSION_IDLE_SECONDS,
  SESSION_MAX_SECONDS,
  createSessionStore,
} from '#/services/auth/sessions.js';

function rig() {
  const clock = { now: 1_000_000 };
  let n = 0;
  const store = createSessionStore(
    () => clock.now,
    () => `id-${++n}`,
  );

  return { clock, store };
}

const seconds = (n: number): number => n * 1000;

describe('one-time codes', () => {
  it('opens a session once and refuses the replay', () => {
    const { store } = rig();
    const { code } = store.issueCode();

    const first = store.redeemCode(code);
    const replay = store.redeemCode(code);

    expect(first).toBeDefined();
    expect(store.verify(first as string)).toBe(true);
    expect(replay).toBeUndefined();
  });

  it('refuses a wrong, empty or oversized code and keeps the real one usable', () => {
    const { store } = rig();
    const { code } = store.issueCode();

    const wrong = store.redeemCode('not-the-code');
    const empty = store.redeemCode('');
    const huge = store.redeemCode('x'.repeat(10_000));

    expect([wrong, empty, huge]).toEqual([undefined, undefined, undefined]);
    expect(store.redeemCode(code)).toBeDefined();
  });

  it('refuses a code after its 60 seconds and spends it', () => {
    const { clock, store } = rig();
    const { code, expiresInSeconds } = store.issueCode();
    clock.now += seconds(CODE_TTL_SECONDS);

    const late = store.redeemCode(code);

    expect(expiresInSeconds).toBe(60);
    expect(late).toBeUndefined();
  });

  it('accepts a code one second before it expires', () => {
    const { clock, store } = rig();
    const { code } = store.issueCode();
    clock.now += seconds(CODE_TTL_SECONDS - 1);

    expect(store.redeemCode(code)).toBeDefined();
  });

  it('keeps at most a few codes open, dropping the oldest', () => {
    const { store } = rig();
    const codes = Array.from(
      { length: MAX_OPEN_CODES + 1 },
      () => store.issueCode().code,
    );

    const oldest = store.redeemCode(codes[0] as string);
    const newest = store.redeemCode(codes[MAX_OPEN_CODES] as string);

    expect(oldest).toBeUndefined();
    expect(newest).toBeDefined();
  });
});

describe('sessions', () => {
  function signedIn() {
    const world = rig();
    const id = world.store.redeemCode(world.store.issueCode().code) as string;

    return { ...world, id };
  }

  it('does not know an id it never issued', () => {
    const { store } = rig();

    expect(store.verify('id-99')).toBe(false);
    expect(store.verify('')).toBe(false);
  });

  it('expires after the idle time without use', () => {
    const { clock, store, id } = signedIn();
    clock.now += seconds(SESSION_IDLE_SECONDS);

    expect(store.verify(id)).toBe(false);
  });

  it('slides the idle expiry on every use', () => {
    const { clock, store, id } = signedIn();

    for (let i = 0; i < 4; i += 1) {
      clock.now += seconds(SESSION_IDLE_SECONDS - 60);
      expect(store.verify(id)).toBe(true);
    }
  });

  it('ends at the hard limit however busy it is', () => {
    const { clock, store, id } = signedIn();
    let alive = true;

    for (let t = 0; t < SESSION_MAX_SECONDS + SESSION_IDLE_SECONDS; t += 3600) {
      clock.now += seconds(3600);
      alive = store.verify(id);
      if (!alive) {
        break;
      }

      expect(clock.now - 1_000_000).toBeLessThan(seconds(SESSION_MAX_SECONDS));
    }

    expect(alive).toBe(false);
  });

  it('is gone after revoke', () => {
    const { store, id } = signedIn();

    store.revoke(id);

    expect(store.verify(id)).toBe(false);
  });

  it('caps the table by dropping the oldest session', () => {
    const { store } = rig();
    const ids = Array.from(
      { length: MAX_SESSIONS + 1 },
      () => store.redeemCode(store.issueCode().code) as string,
    );

    expect(store.verify(ids[0] as string)).toBe(false);
    expect(store.verify(ids[MAX_SESSIONS] as string)).toBe(true);
  });
});

describe('the session cookie', () => {
  it('is HttpOnly, SameSite=Strict and Path=/, with a lifetime', () => {
    const header = sessionCookie('abc', 600);

    expect(header).toBe(
      'forge_session=abc; HttpOnly; SameSite=Strict; Path=/; Max-Age=600',
    );
  });

  it('is cleared with the same attributes', () => {
    expect(clearedSessionCookie()).toBe(
      'forge_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
    );
  });

  it.each([
    ['forge_session=abc', 'abc'],
    ['a=1; forge_session=abc; b=2', 'abc'],
    ['xforge_session=abc', undefined],
    ['forge_session=', undefined],
    ['', undefined],
    [undefined, undefined],
  ])('reads %j as %j', (header, expected) => {
    expect(sessionIdOf(header)).toBe(expected);
  });
});
