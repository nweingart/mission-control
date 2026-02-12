import { useState, useCallback, useRef, useEffect } from 'react';
import Chat from './Chat';
import { useAppStore } from '../store/useAppStore';
import { extractBacklogSuggestions } from '../utils/planning';
import type { ChatMessage } from '../types';
import houstonAvatar from '../assets/houston-avatar.webp';

const WELCOME_CONTENT = "Hey! I'm Houston, your project assistant. Ask me anything about your code, tasks, or architecture.";

function makeWelcomeMessage(): ChatMessage {
  return {
    id: 'houston-welcome',
    role: 'assistant',
    content: WELCOME_CONTENT,
    timestamp: new Date(),
  };
}

// Module-level state — survives unmount/remount across screens
let _messages: ChatMessage[] = [];
let _isOpen = false;
let _isExpanded = false;
let _hasOpened = false;

const PRD_CHAR_LIMIT = 4000;

async function buildPrompt(
  userMessage: string,
  history: ChatMessage[],
): Promise<string> {
  const { currentProject, tasks, backlog, sprints } = useAppStore.getState();
  if (!currentProject) return userMessage;

  // Fetch PRD (async)
  let prd: string | null = null;
  try {
    prd = await window.api.storage.getPRD(currentProject.slug);
  } catch {
    // PRD not available — that's fine
  }

  // Tasks section
  const completedCount = tasks.filter((t) => t.completed).length;
  const taskLines = tasks.length > 0
    ? tasks.map((t) => `- [${t.completed ? 'x' : ' '}] ${t.title}`).join('\n')
    : '(none)';

  // Backlog section
  const backlogLines = backlog.length > 0
    ? backlog.map((b) => `- [${b.priority}] ${b.title}${b.description ? ' \u2014 ' + b.description : ''}`).join('\n')
    : '(none)';

  // Sprints section
  const sprintLines = sprints.length > 0
    ? sprints.map((s) => {
        const itemCount = backlog.filter((b) => b.sprintId === s.id).length;
        return `- ${s.name} (${itemCount} items)`;
      }).join('\n')
    : '(none)';

  // Conversation history (skip welcome message)
  const conversationLines = history
    .filter((m) => m.id !== 'houston-welcome')
    .map((m) => `${m.role === 'user' ? 'User' : 'Houston'}: ${m.content}`)
    .join('\n\n');

  // PRD section (truncate if needed)
  const prdSection = prd
    ? prd.length > PRD_CHAR_LIMIT
      ? prd.substring(0, PRD_CHAR_LIMIT) + '\n... (truncated)'
      : prd
    : '(none)';

  return `You are Houston, a casual and friendly project assistant for "${currentProject.name}".

RULES:
- Answer ONLY what the user asked. Do not volunteer extra information, next steps, or unrequested suggestions.
- Keep responses short — a few sentences is usually enough. Match the depth of the question.
- Be conversational, not formal. Talk like a knowledgeable teammate, not a report generator.
- Only reference the project data below when it's directly relevant to the question.

PLANNING & BACKLOG:
- You can help plan bug fixes, refactors, and new features.
- When the user wants to add something to the backlog, gather details conversationally first.
- When ready to add, use EXACTLY this format:

[BACKLOG_ADD]
Title: [title]
Description: [1-2 sentence description]
Priority: [high/medium/low]
Type: [bug_fix/feature_refactor/new_feature]

- Only use this format when you have enough detail. Confirm what was added.

PROJECT: ${currentProject.name}
Path: ${currentProject.projectPath}
Status: ${currentProject.status}
${currentProject.idea ? `Idea: ${currentProject.idea}` : ''}

<reference_data>
TASKS (${completedCount}/${tasks.length} completed):
${taskLines}

BACKLOG (${backlog.length} items):
${backlogLines}

SPRINTS:
${sprintLines}

PRD:
${prdSection}
</reference_data>

${conversationLines ? `CONVERSATION:\n${conversationLines}\n` : ''}User: ${userMessage}`;
}

export default function Houston() {
  const [isOpen, _setIsOpen] = useState(_isOpen);
  const [isExpanded, _setIsExpanded] = useState(_isExpanded);
  const [messages, _setMessages] = useState<ChatMessage[]>(_messages);
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  // Wrapped setters that sync back to module-level state
  const setIsOpen = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    _setIsOpen((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      _isOpen = next;
      return next;
    });
  }, []);

  const setIsExpanded = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    _setIsExpanded((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      _isExpanded = next;
      return next;
    });
  }, []);

  const setMessages = useCallback((updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    _setMessages((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      _messages = next;
      return next;
    });
  }, []);

  const currentProject = useAppStore((s) => s.currentProject);

  // Expose window.openHouston() so other screens can open it
  useEffect(() => {
    (window as unknown as { openHouston?: () => void }).openHouston = () => {
      if (!_hasOpened) {
        _hasOpened = true;
        setMessages([makeWelcomeMessage()]);
      }
      setIsOpen(true);
    };
    return () => {
      delete (window as unknown as { openHouston?: () => void }).openHouston;
    };
  }, [setIsOpen, setMessages]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      // Add welcome message on first open
      if (next && !_hasOpened) {
        _hasOpened = true;
        setMessages([makeWelcomeMessage()]);
      }
      return next;
    });
  }, [setIsOpen, setMessages]);

  const handleSend = useCallback(async (content: string) => {
    if (!currentProject) return;

    const userMsg: ChatMessage = {
      id: `houston-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const prompt = await buildPrompt(content, [...messagesRef.current, userMsg]);
      const response = await window.api.claude.chat(currentProject.projectPath, prompt);

      const assistantMsg: ChatMessage = {
        id: `houston-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Extract backlog items from response and auto-add
      const suggestions = extractBacklogSuggestions(response);
      if (suggestions.length > 0) {
        const { addBacklogItem } = useAppStore.getState();
        for (const s of suggestions) {
          addBacklogItem({
            title: s.title,
            description: s.description,
            priority: s.priority,
            type: s.type || undefined,
          });
        }
        const confirmMsg: ChatMessage = {
          id: `houston-confirm-${Date.now()}`,
          role: 'assistant',
          content: `Added to backlog: ${suggestions.map((s) => `"${s.title}"`).join(', ')}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, confirmMsg]);
      }
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `houston-err-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I hit an error: ${err instanceof Error ? err.message : 'Unknown error'}. Try again?`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, setMessages]);

  const handleCancel = useCallback(() => {
    window.api.claude.cancelChat().catch(() => {});
    setIsLoading(false);
  }, []);

  if (!currentProject) return null;

  const panelWidth = isExpanded ? 'w-[700px]' : 'w-[400px]';
  const panelHeight = isExpanded
    ? 'h-[calc(100vh-120px)]'
    : 'h-[500px] max-h-[calc(100vh-180px)]';

  return (
    <>
      {/* Chat panel */}
      {isOpen && (
        <div className={`fixed bottom-20 right-6 z-50 ${panelWidth} ${panelHeight} flex flex-col bg-surface border border-border rounded-lg shadow-lg transition-all duration-200`}>
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-light rounded-t-lg">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full overflow-hidden border-2 border-spectrum-blue"><img src={houstonAvatar} alt="Houston" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" /></div>
              <span className="font-display text-sm font-semibold tracking-wide text-ink">Houston</span>
            </div>
            <div className="flex items-center gap-1">
              {isLoading && (
                <button
                  onClick={handleCancel}
                  className="text-xs text-error hover:text-error/80 px-2 py-1 rounded transition-colors"
                  title="Cancel request"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => setIsExpanded((prev) => !prev)}
                className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors"
                title={isExpanded ? 'Compact' : 'Expand'}
              >
                {isExpanded ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4m6 6l5 5m0 0v-4m0 4h-4" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 3h6m0 0v6m0-6l-7 7M9 21H3m0 0v-6m0 6l7-7" />
                  </svg>
                )}
              </button>
              <button
                onClick={handleToggle}
                className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors"
                title="Minimize"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Chat body */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <Chat
              messages={messages}
              onSendMessage={handleSend}
              isLoading={isLoading}
              placeholder="Ask Houston anything..."
            />
          </div>
        </div>
      )}

      {/* Floating button (always visible) */}
      <button
        onClick={handleToggle}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 overflow-hidden border-[3px] border-spectrum-blue hover:shadow-[0_0_14px_rgba(82,158,214,0.6)]"
        title="Ask Houston"
      >
        <img src={houstonAvatar} alt="Houston" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
      </button>
    </>
  );
}
