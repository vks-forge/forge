/**
 * Agent template gallery — ready-made agents an owner can start from.
 *
 * Why: most owners want a security reviewer or a docs writer, not a blank form, and writing
 *   good reviewer instructions from nothing is the hard part. The gallery ships six agents with
 *   real instructions, a role and the right tool bounds. They are not part of any roster until
 *   the owner picks one; picking opens the editor prefilled, and what is saved is a normal
 *   custom agent that remembers the template it came from.
 *
 * Exports: AGENT_TEMPLATES.
 * Depends on: domain/agent-templates/*, schemas/agent-api. No IO.
 */

import { ACCESSIBILITY_REVIEWER_TEMPLATE } from '#/domain/agent-templates/accessibility-reviewer.js';
import { DOCS_WRITER_TEMPLATE } from '#/domain/agent-templates/docs-writer.js';
import { MIGRATION_REVIEWER_TEMPLATE } from '#/domain/agent-templates/migration-reviewer.js';
import { NETWORK_CONFIG_REVIEWER_TEMPLATE } from '#/domain/agent-templates/network-config-reviewer.js';
import { PERFORMANCE_REVIEWER_TEMPLATE } from '#/domain/agent-templates/performance-reviewer.js';
import { SECURITY_REVIEWER_TEMPLATE } from '#/domain/agent-templates/security-reviewer.js';
import type { AgentTemplate } from '#/schemas/agent-api.js';

export const AGENT_TEMPLATES: readonly AgentTemplate[] = [
  SECURITY_REVIEWER_TEMPLATE,
  DOCS_WRITER_TEMPLATE,
  NETWORK_CONFIG_REVIEWER_TEMPLATE,
  ACCESSIBILITY_REVIEWER_TEMPLATE,
  PERFORMANCE_REVIEWER_TEMPLATE,
  MIGRATION_REVIEWER_TEMPLATE,
];
