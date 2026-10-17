/**
 * ToolsSection: which tools an agent may use.
 *
 * Why: tools are what turns "reads the diff" into "rewrites the diff", so the choice has to be
 *   explicit and its limits visible. A writer or tester may follow the lane's default tools or
 *   pick its own; a reviewer or researcher must pick, and every tool that edits files or runs
 *   commands is shown greyed out with the reason instead of being left out, so the owner sees
 *   what the role gives up. The list comes from the tool catalogue; if it cannot be read the
 *   native tools are offered so the form still works, and the section says so.
 *
 * Exports: ToolsSection.
 * Depends on: api/use-agents, components/settings/{settings-card,form-field},
 *   components/ui/field, domain/agent-form, domain/agent-tools, types/agent-ui.types.
 */

import { useAgentTools } from '#/api/use-agents.js';
import { Notice } from '#/components/settings/form-field.js';
import { SettingsCard } from '#/components/settings/settings-card.js';
import { Switch } from '#/components/ui/field.js';
import { toggleTool } from '#/domain/agent-form.js';
import { toolOptions, WRITE_TOOL_REASON } from '#/domain/agent-tools.js';
import type { AgentForm } from '#/types/agent-ui.types.js';

export function ToolsSection(props: {
  form: AgentForm;
  error: string | undefined;
  disabled: boolean;
  onChange: (next: AgentForm) => void;
}) {
  const { form } = props;
  const catalogue = useAgentTools();
  const readOnly = form.role === 'reviewer' || form.role === 'researcher';
  const lane = form.tools === 'lane_default';
  const chosen = form.tools === 'lane_default' ? [] : form.tools;
  const options = toolOptions(catalogue.data, chosen);

  return (
    <SettingsCard
      id="tools"
      title="Tools"
      description="What the agent may use while it works. A tool outside this list is refused, whatever the agent asks for."
    >
      <div className="grid gap-4">
        {readOnly ? null : (
          <div className="flex items-center gap-3">
            <Switch
              label="Follow the lane’s default tools"
              checked={lane}
              disabled={props.disabled}
              onChange={(on) =>
                props.onChange({ ...form, tools: on ? 'lane_default' : [] })
              }
            />
            <span className="text-sm">Follow the lane’s default tools</span>
          </div>
        )}
        {catalogue.isError ? (
          <Notice tone="warn" title="The tool catalogue could not be read">
            Showing the native tools only. Other tools in the catalogue will appear after
            a reload.
          </Notice>
        ) : null}
        {lane && !readOnly ? (
          <p className="text-sm text-muted">
            The agent gets whatever tools the ticket’s lane allows. Turn this off to
            choose.
          </p>
        ) : (
          <fieldset className="grid gap-1.5" disabled={props.disabled}>
            <legend className="sr-only">Tools</legend>
            {options.map((tool) => {
              const blocked = readOnly && tool.writes;
              const id = `tool-${tool.id}`;

              return (
                <div
                  key={tool.id}
                  className="flex items-start gap-3 rounded-lg px-1 py-1"
                >
                  <input
                    id={id}
                    type="checkbox"
                    className="mt-1 size-4 accent-signal"
                    checked={chosen.includes(tool.id)}
                    disabled={blocked || props.disabled}
                    aria-describedby={blocked ? `${id}-why` : undefined}
                    onChange={() => props.onChange(toggleTool(form, tool.id))}
                  />
                  <label htmlFor={id} className="grid gap-0.5 text-sm">
                    <span className={blocked ? 'text-faint' : ''}>{tool.label}</span>
                    <span className="font-data text-xs text-muted">
                      {tool.id}
                      {tool.risk ? ` · ${tool.risk}` : ''}
                    </span>
                    {blocked ? (
                      <span id={`${id}-why`} className="text-xs text-muted">
                        {WRITE_TOOL_REASON}
                      </span>
                    ) : null}
                  </label>
                </div>
              );
            })}
          </fieldset>
        )}
        {props.error ? (
          <p role="alert" className="text-xs text-danger">
            {props.error}
          </p>
        ) : null}
      </div>
    </SettingsCard>
  );
}
