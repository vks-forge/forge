/**
 * Harness and model choices for the "Runs on" section, as picker rows.
 *
 * Why: where an agent runs is two decisions, a harness and a model, and the right answer for a
 *   reviewer (a deep model) differs from a quick writer's. The server reports every harness
 *   with whether it can run today and which models it offers; this turns that into rows the
 *   shared Picker shows: a harness that cannot run stays visible but disabled with its reason
 *   (so the owner learns why instead of wondering where it went), models are grouped by what
 *   they are recommended for, and the three non-model choices (follow the harness, follow the
 *   Forge lane model, type any id) sit beside them. Any model id still works, because
 *   harnesses name models their own way.
 *
 * Exports: PROJECT_HARNESS, CUSTOM_MODEL, harnessItems(), modelsFor(), modelItems(),
 *   modelValue(), choiceFromValue(), runsOnLabel(), notReadyHarnesses(), directorModelChoices().
 * Depends on: domain/agent-copy, components/ui picker types, schemas/agents.
 */

import { modelCostWords, ROLE_INFO } from '#/domain/agent-copy.js';
import { MODEL_CHOICES } from '#/domain/director-settings.js';
import type {
  AgentRole,
  HarnessModel,
  ModelChoice,
  RunsOn,
  RunsOnHarness,
} from '#/schemas/agents.js';
import type { PickerItem } from '#/types/picker.types.js';

export const PROJECT_HARNESS = 'project_default';
export const CUSTOM_MODEL = 'custom';

/** "Project default", then every configured harness; one that cannot run is disabled with why. */
export function harnessItems(harnesses: readonly RunsOnHarness[]): PickerItem[] {
  const rows: PickerItem[] = harnesses.map((h) => {
    const facts = [
      h.version ? `version ${h.version}` : undefined,
      h.signed_in ? 'signed in' : 'not signed in',
    ].filter((f): f is string => f !== undefined);

    return {
      value: h.id,
      label: h.id,
      description: facts.join(', '),
      ...(h.ready
        ? {}
        : {
            disabled: true,
            badge: 'not ready',
            disabledReason:
              h.reasons.join(' ') || 'This harness cannot run work right now.',
          }),
    };
  });

  return [
    {
      value: PROJECT_HARNESS,
      label: 'Project default',
      description: 'Whichever harness the project uses.',
    },
    ...rows,
  ];
}

/** The harnesses that cannot run now, for the "Fix in settings" list. */
export function notReadyHarnesses(
  harnesses: readonly RunsOnHarness[],
): readonly RunsOnHarness[] {
  return harnesses.filter((h) => !h.ready);
}

/** The models of one harness; for "project default", every model any harness offers, once each. */
export function modelsFor(
  ref: string,
  harnesses: readonly RunsOnHarness[],
): readonly HarnessModel[] {
  const pool =
    ref === PROJECT_HARNESS ? harnesses : harnesses.filter((h) => h.id === ref);

  const seen = new Map<string, HarnessModel>();
  for (const model of pool.flatMap((h) => h.models)) {
    if (!seen.has(model.id)) {
      seen.set(model.id, model);
    }
  }

  return [...seen.values()];
}

/**
 * The model rows: follow the harness, follow the Forge lane model (implementer only), models
 * recommended for this role, the rest, then "type an id".
 */
export function modelItems(
  models: readonly HarnessModel[],
  role: AgentRole,
  allowForgeDefault: boolean,
): PickerItem[] {
  const recommended = `Recommended for ${ROLE_INFO[role].label.toLowerCase()}s`;
  const row = (m: HarnessModel, group: string): PickerItem => ({
    value: `model:${m.id}`,
    label: m.label,
    description: modelCostWords(m),
    group,
  });

  return [
    {
      value: 'harness_default',
      label: 'Harness default',
      description: 'Follows the harness, whatever it picks next.',
    },
    ...(allowForgeDefault
      ? [
          {
            value: 'forge_default',
            label: 'Forge default (lane model)',
            description: 'The model set per lane in Limits.',
          },
        ]
      : []),
    ...models
      .filter((m) => m.recommended_for.includes(role))
      .map((m) => row(m, recommended)),
    ...models
      .filter((m) => !m.recommended_for.includes(role))
      .map((m) => row(m, 'Other models')),
    {
      value: CUSTOM_MODEL,
      label: 'Custom model id…',
      description: 'Type a model name this harness understands.',
      group: 'Not in the list',
    },
  ];
}

/** The picker value of a choice; an id the harness does not list reads as "custom". */
export function modelValue(choice: ModelChoice, models: readonly HarnessModel[]): string {
  if (choice.kind !== 'model') {
    return choice.kind;
  }

  return models.some((m) => m.id === choice.id) ? `model:${choice.id}` : CUSTOM_MODEL;
}

/** The choice for a picker value; "custom" starts as an empty id the owner types into. */
export function choiceFromValue(value: string): ModelChoice {
  if (value === 'harness_default' || value === 'forge_default') {
    return { kind: value };
  }

  return { kind: 'model', id: value.startsWith('model:') ? value.slice(6) : '' };
}

/** A short "where it runs" phrase for a list row. */
export function runsOnLabel(runsOn: RunsOn): string {
  const harness = runsOn.harness === PROJECT_HARNESS ? 'project harness' : runsOn.harness;
  const model =
    runsOn.model.kind === 'model'
      ? runsOn.model.id
      : runsOn.model.kind === 'forge_default'
        ? 'lane model'
        : 'harness default model';

  return `${harness} · ${model}`;
}

/**
 * The Director page's model rows: the models the first harness that reports any (ready ones
 * first) offers, then "Other…"; the built-in list when no harness reports a model.
 */
export function directorModelChoices(
  harnesses: readonly RunsOnHarness[] | undefined,
): readonly PickerItem[] {
  const source = [...(harnesses ?? [])]
    .sort((a, b) => Number(b.ready) - Number(a.ready))
    .find((h) => h.models.length > 0);

  if (!source) {
    return MODEL_CHOICES;
  }

  return [
    ...source.models.map((m) => ({
      value: m.id,
      label: m.label,
      description: modelCostWords(m),
    })),
    { value: 'custom', label: 'Other…', description: 'Type a model name.' },
  ];
}
