/**
 * GroupMembers: the two to four checks of a run-together group.
 *
 * Why: a group runs its checks side by side (a reviewer and a critic, say) and passes only when
 *   every one passes, so a ticket hears from independent eyes without waiting for them one by
 *   one. A group must hold two to four checks and no writers, so removing a member is refused
 *   below two and adding one above four, each with its reason, and the group's "send back to"
 *   decides where the work goes for all of them. Members are edited in place with the same
 *   agent and script fields as a stage of their own.
 *
 * Exports: GroupMembers.
 * Depends on: react, lucide-react, components/pipelines/{stage-details,script-fields,check-policy},
 *   components/ui/*, domain/pipeline-edit, @forge/core (types).
 */

import { Plus, Trash2 } from 'lucide-react';
import type { AgentView, GroupStage } from '@forge/core';
import { useLaneId } from '#/components/pipelines/lane-ids.js';
import { CheckPolicy } from '#/components/pipelines/check-policy.js';
import { ScriptFields } from '#/components/pipelines/script-fields.js';
import { AgentStageFields } from '#/components/pipelines/stage-details.js';
import { TextInput } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { Field } from '#/components/ui/field.js';
import { IconButton } from '#/components/ui/icon-button.js';
import { MAX_MEMBERS, MIN_MEMBERS, newMember, uniqueId } from '#/domain/pipeline-edit.js';
import type { Member, WriterOption } from '#/types/pipeline-ui.types.js';

export function GroupMembers(props: {
  group: GroupStage;
  roster: readonly AgentView[];
  writers: readonly WriterOption[];
  /** Ids already used anywhere in the pipeline, so a new member's id is free. */
  taken: ReadonlySet<string>;
  onChange: (next: GroupStage) => void;
}) {
  const { group } = props;
  const prefix = useLaneId('');
  const replace = (next: Member): void =>
    props.onChange({
      ...group,
      members: group.members.map((m) => (m.id === next.id ? next : m)),
    });

  const add = (kind: 'agent' | 'script_gate'): void => {
    const id = uniqueId(`${group.id}-${group.members.length + 1}`, props.taken);

    props.onChange({
      ...group,
      members: [...group.members, newMember(kind, id, props.roster)],
    });
  };

  const atMin = group.members.length <= MIN_MEMBERS;
  const atMax = group.members.length >= MAX_MEMBERS;

  return (
    <div className="grid gap-3">
      <Field id={`${prefix}label-${group.id}`} label="Name">
        <TextInput
          id={`${prefix}label-${group.id}`}
          value={group.label}
          maxLength={80}
          onChange={(event) => props.onChange({ ...group, label: event.target.value })}
        />
      </Field>

      <ul aria-label={`Checks in ${group.label}`} className="grid gap-3">
        {group.members.map((member) => (
          <li
            key={member.id}
            aria-label={member.label}
            className="grid gap-3 rounded-lg border border-line bg-hover p-3"
          >
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field id={`${prefix}label-${member.id}`} label="Check name">
                  <TextInput
                    id={`${prefix}label-${member.id}`}
                    value={member.label}
                    maxLength={80}
                    onChange={(event) =>
                      replace({ ...member, label: event.target.value })
                    }
                  />
                </Field>
              </div>
              <IconButton
                label={`Remove ${member.label} from the group`}
                blockedReason={atMin ? 'A group holds at least 2 checks.' : undefined}
                onClick={() =>
                  props.onChange({
                    ...group,
                    members: group.members.filter((m) => m.id !== member.id),
                  })
                }
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            </div>
            {member.kind === 'agent' ? (
              <AgentStageFields
                stage={member}
                roster={props.roster}
                writers={props.writers}
                inGroup
                onChange={replace}
              />
            ) : (
              <>
                <ScriptFields stage={member} onChange={replace} />
                <CheckPolicy
                  stage={member}
                  writers={props.writers}
                  inGroup
                  onChange={replace}
                />
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={atMax} onClick={() => add('agent')}>
          <Plus aria-hidden="true" className="size-4" />
          Add an agent check
        </Button>
        <Button disabled={atMax} onClick={() => add('script_gate')}>
          <Plus aria-hidden="true" className="size-4" />
          Add a script check
        </Button>
        {atMax ? (
          <span className="text-xs text-muted">A group holds at most 4 checks.</span>
        ) : null}
      </div>

      <CheckPolicy stage={group} writers={props.writers} onChange={props.onChange} />
    </div>
  );
}
