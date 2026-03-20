import type { ChatMessage } from '../types';

// Per-project chat state — survives unmount/remount, scoped by project slug
export interface AssistantProjectChat {
  messages: ChatMessage[];
  hasOpened: boolean;
  unreadProactiveCount: number;
}

const chatsByProject = new Map<string, AssistantProjectChat>();

/** Remove chat state for a closed/evicted project to prevent memory leaks. (Mission Control) */
export function clearProjectChat(slug: string): void {
  chatsByProject.delete(slug);
}

export function getProjectChat(slug: string): AssistantProjectChat {
  let chat = chatsByProject.get(slug);
  if (!chat) {
    chat = { messages: [], hasOpened: false, unreadProactiveCount: 0 };
    chatsByProject.set(slug, chat);
  }
  return chat;
}

/** Queue a proactive assistant message into a project's Assistant chat. */
export function queueAssistantMessage(slug: string, content: string): void {
  const chat = getProjectChat(slug);
  chat.messages.push({
    id: `mc-proactive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    role: 'assistant',
    content,
    timestamp: new Date(),
  });
  chat.unreadProactiveCount++;
}
