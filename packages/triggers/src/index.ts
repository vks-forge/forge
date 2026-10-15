/**
 * Public API of @forge/triggers.
 *
 * Why: the server registers ticket sources by importing factories from this one door, so a
 *   new source (GitHub issues, cron) is a new folder under `adapters/` and one line in the
 *   server's composition.
 *
 * Exports: createChatTrigger.
 * Depends on: adapters/chat. Re-exports only.
 */

export { createChatTrigger } from '#/adapters/chat/chat-trigger.js';
