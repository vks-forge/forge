/**
 * Pins: the web's Director rules agree with core's shipped built-ins and step list.
 *
 * Why: the web re-checks the flow before saving and offers a model and a timeout for each
 *   Director step. If core adds a step, renames a built-in step id or ships a flow the web's
 *   own check rejects, the page would hide a step, or refuse to save an untouched default. The
 *   other Director tests use a sample; this one reads core's real built-ins so a drift fails
 *   here instead of in front of the owner.
 * Depends on: @forge/core, domain/director-flow-edit, domain/director-settings,
 *   schemas/director-config. No DOM.
 */

import { BUILTIN_DIRECTOR_CONFIG, BUILTIN_FORGE_CONFIG, STEP_NAMES } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { flowIssues } from '#/domain/director-flow-edit.js';
import { DIRECTOR_FIELDS, STEP_INFO } from '#/domain/director-settings.js';
import { CompanyConfigReply } from '#/schemas/director-config.js';

describe('core built-ins', () => {
  it('pass the web flow check untouched, with every named playbook present', () => {
    expect(
      flowIssues(BUILTIN_DIRECTOR_CONFIG.flow, BUILTIN_DIRECTOR_CONFIG.playbooks),
    ).toEqual([]);
  });

  it('have a name, a model slot and a timeout field for every Director step', () => {
    expect(Object.keys(STEP_INFO).sort()).toEqual([...STEP_NAMES].sort());
    expect(Object.keys(BUILTIN_DIRECTOR_CONFIG.step_timeouts_ms).sort()).toEqual(
      [...STEP_NAMES].sort(),
    );

    expect(DIRECTOR_FIELDS.step_timeouts_ms.map((f) => f.path).sort()).toEqual(
      STEP_NAMES.map((n) => `director.step_timeouts_ms.${n}`).sort(),
    );
  });

  it('parse through the lenient company reply as a server that has the section', () => {
    const parsed = CompanyConfigReply.parse({ config: BUILTIN_FORGE_CONFIG, version: 0 });

    expect(parsed.serverHasDirector).toBe(true);
    expect(parsed.config.director).toEqual(BUILTIN_DIRECTOR_CONFIG);
  });
});
