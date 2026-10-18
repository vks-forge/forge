/**
 * GroupMembers: the two to four checks of a run-together group.
 *
 * Why: a group runs its members side by side and passes only when every one does. Two kinds
 *   exist and the group tells which it is: a group of checks (a reviewer and a critic, say), where
 *   independent eyes need not wait for one another, and a group of writers, where two writers
 *   share one worktree and so must own different folders. A group holds two to four members, so
 *   removing one is refused below two and adding one above four, each with its reason. In a
 *   writer group every member shows the folders its agent may write (and says so when it has no
 *   limit), because two writers whose folders overlap cannot be saved and the owner should see
 *   why before the server says it. A script check cannot join writers and no red proof runs
 *   inside a group. The group's "send back to" decides where the work goes for a group of checks.
 *
 * Exports: GroupMembers.
 * Depends on: lucide-react, components/pipelines/{stage-details,script-fields,check-policy},
 *   components/ui/*, domain/{pipeline-add,pipeline-edit}, @forge/core (types).
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
import { newMember } from '#/domain/pipeline-add.js';
import {
  MAX_MEMBERS,
  MIN_MEMBERS,
  isWriterGroup,
  uniqueId,
} from '#/domain/pipeline-edit.js';
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
      members: [...group.members, newMember(kind, id, props.roster, writerGroup)],
    });
  };

  const writerGroup = isWriterGroup(group, props.roster);
  const scopeOf = (agent: string): readonly string[] | undefined =>
    props.roster.find((a) => a.id === agent)?.definition.write_scope;

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

      {writerGroup ? (
        <p className="text-xs text-muted">
          These writers work at the same time in one worktree. Each must own different
          folders; two that could write the same files cannot be saved.
        </p>
      ) : null}

      <ul
        aria-label={`${writerGroup ? 'Writers' : 'Checks'} in ${group.label}`}
        className="grid gap-3"
      >
        {group.members.map((member) => (
          <li
            key={member.id}
            aria-label={member.label}
            className="grid gap-3 rounded-lg border border-line bg-hover p-3"
          >
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field
                  id={`${prefix}label-${member.id}`}
                  label={writerGroup ? 'Writer name' : 'Check name'}
                >
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
                blockedReason={atMin ? 'A group holds at least 2 members.' : undefined}
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
            {writerGroup && member.kind === 'agent' ? (
              <p className="min-w-0 break-all text-xs">
                <span className="font-medium">May write: </span>
                {(scopeOf(member.agent) ?? []).length === 0 ? (
                  <span className="text-muted">
                    anywhere (no folders set for this agent)
                  </span>
                ) : (
                  <span className="font-data">{scopeOf(member.agent)?.join(', ')}</span>
                )}
              </p>
            ) : null}
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
          {writerGroup ? 'Add a writer' : 'Add an agent check'}
        </Button>
        {writerGroup ? null : (
          <Button disabled={atMax} onClick={() => add('script_gate')}>
            <Plus aria-hidden="true" className="size-4" />
            Add a script check
          </Button>
        )}
        {atMax ? (
          <span className="text-xs text-muted">{`A group holds at most 4 ${writerGroup ? 'writers' : 'checks'}.`}</span>
        ) : null}
      </div>

      {writerGroup ? null : (
        <CheckPolicy stage={group} writers={props.writers} onChange={props.onChange} />
      )}
    </div>
  );
}
