import type { ChatResult, AgentProvider, AgentRoleConfig } from '../types';

export type PipelineRole = 'builder' | 'reviewer';

export interface AgentAPI {
  chat: (projectPath: string, prompt: string, timeoutMs?: number, chatId?: string) => Promise<ChatResult>;
  onChatOutputForTask: (chatId: string, cb: (content: string) => void) => void;
  offChatOutputForTask: (chatId: string) => void;
  cancelChat: (chatId?: string) => Promise<void>;
  provider: AgentProvider;
}

const DEFAULT_ROLES: AgentRoleConfig = { builder: 'claude', reviewer: 'claude' };

/**
 * Returns the correct agent API for a given pipeline role based on config.
 * When multiAgentEnabled is false, always returns Claude (zero behavioral change).
 */
export function getAgentForRole(
  multiAgentEnabled: boolean,
  agentRoles: AgentRoleConfig | undefined,
  role: PipelineRole
): AgentAPI {
  const roles = agentRoles ?? DEFAULT_ROLES;
  const provider = multiAgentEnabled ? roles[role] : 'claude';

  const api = provider === 'codex' ? window.api.codex : window.api.claude;
  return { ...api, provider };
}

/**
 * Cancel only build-owned chatIds across both agents.
 * Does NOT cancel all agent work globally — other flows (discovery, gap analysis, etc.) are unaffected.
 */
export async function cancelBuildAgents(chatIds: string[]): Promise<void> {
  if (chatIds.length === 0) return;
  await Promise.allSettled(
    chatIds.flatMap((id) => [
      window.api.claude.cancelChat(id),
      window.api.codex?.cancelChat(id),
    ].filter(Boolean))
  );
}
