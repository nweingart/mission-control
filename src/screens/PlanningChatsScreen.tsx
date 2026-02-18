import { useEffect, useState, useCallback, useRef } from 'react';
import { useProjectStore, useProjectStoreApi } from '../store/ProjectStoreContext';
import Chat from '../components/Chat';
import { extractBacklogSuggestions } from '../utils/planning';
import { resilientChat, isCancelError } from '../utils/resilient-chat';
import type { PlanningChat, PlanningType } from '../types';

const PLANNING_TYPE_OPTIONS: Array<{
  type: PlanningType;
  icon: JSX.Element;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = [
  {
    type: 'bug_fix',
    icon: (
      <svg className="w-9 h-9" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" opacity="0" />
        <path d="M12 21a2 2 0 01-2-2h4a2 2 0 01-2 2zm-4-4h8v-1.5H8V17zm.5-3h7a4.5 4.5 0 00.88-2H7.62a4.5 4.5 0 00.88 2zM19 10h2v2h-2a7.02 7.02 0 00-1.28-3.19l1.42-1.42-1.42-1.42-1.42 1.42A6.98 6.98 0 0013 5.08V3h-2v2.08a6.98 6.98 0 00-3.3 1.31L6.28 4.97 4.86 6.39l1.42 1.42A7.02 7.02 0 005 12H3v-2h2" />
      </svg>
    ),
    label: 'Fix Bug',
    description: 'Something broke — let\'s find it and fix it',
    color: '#CC4434',
    bgColor: 'rgba(204,68,52,0.08)',
    borderColor: 'rgba(204,68,52,0.25)',
  },
  {
    type: 'feature_refactor',
    icon: (
      <svg className="w-9 h-9" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6-3.4 3.4-1.6-1.6a1 1 0 00-1.4 0l-4.3 4.3a1 1 0 000 1.4l2.6 2.6a1 1 0 001.4 0l4.3-4.3a1 1 0 000-1.4l-1.6-1.6 3.4-3.4 1.6 1.6a1 1 0 001.4 0l2-2a1 1 0 000-1.4l-2.6-2.6a1 1 0 00-1.4 0l-2 2z" />
      </svg>
    ),
    label: 'Refactor Existing',
    description: 'Clean up, rework, or improve what\'s already there',
    color: '#3E8AC2',
    bgColor: 'rgba(62,138,194,0.08)',
    borderColor: 'rgba(62,138,194,0.25)',
  },
  {
    type: 'new_feature',
    icon: (
      <svg className="w-9 h-9" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9.5 2A1.5 1.5 0 008 3.5V4H5.5A1.5 1.5 0 004 5.5v13A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0018.5 4H16v-.5A1.5 1.5 0 0014.5 2h-5zM12 8a.75.75 0 01.75.75v2.5h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5h-2.5a.75.75 0 010-1.5h2.5v-2.5A.75.75 0 0112 8z" />
      </svg>
    ),
    label: 'New Feature',
    description: 'Add something that doesn\'t exist yet',
    color: '#449256',
    bgColor: 'rgba(68,146,86,0.08)',
    borderColor: 'rgba(68,146,86,0.25)',
  },
];

function buildTypeSystemPrompt(
  planningType: PlanningType,
  projectName: string,
  prd: string | null,
  v1Features: string,
  backlogFeatures: string
): string {
  const backlogAddFormat = `When you have gathered enough information, add the item to the backlog using EXACTLY this format:

[BACKLOG_ADD]
Title: [title]
Description: [1-2 sentence description]
Priority: [high/medium/low]
Type: [bug_fix/feature_refactor/new_feature]

After adding, confirm what was added and ask if they want to plan something else.
NEVER use this format until you have enough detail from the conversation.`;

  const context = `Context:
- PRD: ${prd || 'Not available'}
- V1 Features being built:
${v1Features || 'None specified'}
${backlogFeatures}`;

  if (planningType === 'bug_fix') {
    return `You are helping document a bug report for "${projectName}".
Ask about: what's broken, expected vs actual behavior, steps to reproduce, which screen/feature, severity.
Keep responses short — 2-3 sentences max.
When you have enough info (behavior, repro steps, severity), automatically add it using the format below.

${context}

${backlogAddFormat}`;
  }

  if (planningType === 'feature_refactor') {
    return `You are helping plan a feature refactor for "${projectName}".
Ask about: which existing feature needs improvement, what's wrong with current UX/implementation, desired outcome.
Keep responses short — 2-3 sentences max.
When the refactor scope is clear, automatically add it using the format below.

${context}

${backlogAddFormat}`;
  }

  // new_feature
  return `You are helping plan a new feature for "${projectName}".
Discuss the feature idea. Ask clarifying questions about scope, UX, and edge cases.
Keep responses short — 2-3 sentences max.
When the feature is fleshed out, automatically add it using the format below.

${context}

${backlogAddFormat}`;
}

function getAutoGreetPrompt(planningType: PlanningType): string {
  if (planningType === 'bug_fix') {
    return "Hi! I'm here to help document a bug. What's going wrong? Tell me what you're seeing.";
  }
  if (planningType === 'feature_refactor') {
    return "Hi! I'm here to help plan a feature refactor. Which existing feature needs improvement, and what's the issue with it?";
  }
  return "Hi! I'm here to help plan a new feature. What's the idea?";
}

export default function PlanningChatsScreen() {
  const {
    currentProject,
    planningChats,
    activePlanningChatId,
    getActivePlanningMessages,
    loadPlanningChats,
    setActivePlanningChat,
    createPlanningChat,
    addPlanningMessage,
    goToPreview,
    backlog,
    loadBacklog,
    addBacklogItem,
    deletePlanningChat,
    renamePlanningChat,
  } = useProjectStore();
  const projectStoreApi = useProjectStoreApi();

  const [isLoading, setIsLoading] = useState(false);
  const [planningType, setPlanningType] = useState<PlanningType | null>(null);
  const [autoAddedItems, setAutoAddedItems] = useState<string[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);

  // Load planning chats and backlog on mount
  useEffect(() => {
    loadPlanningChats();
    loadBacklog();
  }, [loadPlanningChats, loadBacklog]);

  // Handle type selection — create a new chat and auto-greet
  const handleTypeSelect = useCallback(
    (type: PlanningType) => {
      setPlanningType(type);
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const label = PLANNING_TYPE_OPTIONS.find((o) => o.type === type)?.label || 'Planning';
      createPlanningChat(`${label} — ${dateStr}`);

      setTimeout(() => {
        addPlanningMessage({ role: 'assistant', content: getAutoGreetPrompt(type) });
      }, 100);
    },
    [createPlanningChat, addPlanningMessage]
  );

  // Handle sending a message
  const handleSendMessage = async (content: string) => {
    if (!currentProject || isLoading) return;

    // Ensure we have an active chat
    let chatId = activePlanningChatId;
    if (!chatId) {
      chatId = createPlanningChat();
    }

    // Add user message
    addPlanningMessage({ role: 'user', content });

    setIsLoading(true);

    try {
      // Build context for Claude
      const prd = await window.api.storage.getPRD(currentProject.slug);
      const tasks = await window.api.storage.getTasks(currentProject.slug);
      const currentBacklog = projectStoreApi.getState().backlog;

      const v1Features = tasks.map((t) => `- ${t.title}`).join('\n') || 'None specified';
      const backlogFeatures = currentBacklog.length > 0
        ? `\n\nCurrent backlog:\n${currentBacklog.map((b) => `- [${b.priority}] ${b.title}`).join('\n')}`
        : '';

      const systemPrompt = buildTypeSystemPrompt(
        planningType || 'new_feature',
        currentProject.name,
        prd,
        v1Features,
        backlogFeatures
      );

      const messages = projectStoreApi.getState().getActivePlanningMessages();
      const conversationHistory = messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

      const fullPrompt = `${systemPrompt}

Conversation so far:
${conversationHistory}

User: ${content}

Respond as the assistant. Be helpful and conversational.`;

      const { promise, cancel } = resilientChat.standard(currentProject.projectPath, fullPrompt);
      cancelRef.current = cancel;
      const response = await promise;
      cancelRef.current = null;
      addPlanningMessage({ role: 'assistant', content: response });

      // Auto-add: extract and immediately add to backlog
      const suggestions = extractBacklogSuggestions(response);
      if (suggestions.length > 0) {
        for (const s of suggestions) {
          addBacklogItem({
            title: s.title,
            description: s.description,
            priority: s.priority,
            type: s.type || planningType || undefined,
            chatId: activePlanningChatId || undefined,
          });
        }
        // Show confirmation banner
        setAutoAddedItems(suggestions.map((s) => s.title));
        setTimeout(() => setAutoAddedItems([]), 4000);
      }
    } catch (err) {
      cancelRef.current = null;
      if (isCancelError(err)) return;
      console.error('Planning chat error:', err);
      addPlanningMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle new chat — reset type selector
  const handleNewChat = useCallback(() => {
    setPlanningType(null);
    setAutoAddedItems([]);
  }, []);

  // Sort chats by most recent
  const sortedChats = [...planningChats].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const activeChat = planningChats.find((c) => c.id === activePlanningChatId);

  const handleDeleteChat = (chatId: string) => {
    deletePlanningChat(chatId);
  };

  const handleRenameChat = (chatId: string, newTitle: string) => {
    renamePlanningChat(chatId, newTitle);
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-surface-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={goToPreview}
              className="text-ink-muted hover:text-ink transition-colors no-drag"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-sans font-bold text-ink">Planning Chats</h1>
              <p className="text-sm font-mono text-ink-muted">{currentProject?.name}</p>
            </div>
          </div>
          <button
            onClick={handleNewChat}
            className="btn-solid-primary px-4 py-2 text-sm font-medium no-drag"
          >
            New Chat
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Chat list sidebar */}
        <div className="w-64 border-r border-border bg-surface-card overflow-y-auto">
          <div className="p-3 space-y-1">
            {sortedChats.length === 0 && (
              <div className="text-center py-8 text-ink-muted">
                <p className="text-sm">No planning chats yet</p>
                <p className="text-xs mt-1">Choose a type to start</p>
              </div>
            )}
            {sortedChats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === activePlanningChatId}
                onClick={() => {
                  setActivePlanningChat(chat.id);
                  // If switching to an existing chat, set a generic type so we skip the selector
                  if (!planningType) setPlanningType('new_feature');
                }}
                onDelete={() => handleDeleteChat(chat.id)}
                onRename={(newTitle) => handleRenameChat(chat.id, newTitle)}
              />
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Type selector (when no type selected and no active chat) */}
          {!planningType && !activeChat ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <h3 className="text-lg font-sans font-bold text-ink mb-1">What would you like to plan?</h3>
              <p className="text-sm text-ink-muted mb-8">Choose a type to start a new conversation</p>
              <div className="flex gap-5 w-full max-w-3xl">
                {PLANNING_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.type}
                    onClick={() => handleTypeSelect(option.type)}
                    className="flex-1 flex flex-col items-start gap-5 py-8 px-6 bg-surface-light rounded-lg transition-all group overflow-hidden relative hover:-translate-y-1"
                    style={{
                      border: `2px solid ${option.borderColor}`,
                      boxShadow: `0 2px 8px rgba(44,38,32,0.07), 0 1px 3px rgba(44,38,32,0.05)`,
                      minHeight: '220px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = `0 12px 32px ${option.borderColor}, 0 4px 12px rgba(44,38,32,0.08)`;
                      e.currentTarget.style.borderColor = option.color;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = `0 2px 8px rgba(44,38,32,0.07), 0 1px 3px rgba(44,38,32,0.05)`;
                      e.currentTarget.style.borderColor = option.borderColor;
                    }}
                  >
                    {/* Colored left accent */}
                    <div className="absolute top-0 left-0 bottom-0 w-1.5 rounded-l-lg" style={{ background: option.color }} />
                    <div
                      className="w-14 h-14 flex items-center justify-center rounded-xl transition-all group-hover:scale-110"
                      style={{ background: option.bgColor, color: option.color }}
                    >
                      {option.icon}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-lg font-bold text-ink">{option.label}</span>
                      <span className="text-sm text-ink-secondary leading-relaxed text-left">{option.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : activeChat ? (
            <>
              <div className="flex-1 overflow-hidden">
                <Chat
                  messages={getActivePlanningMessages()}
                  onSendMessage={handleSendMessage}
                  isLoading={isLoading}
                  placeholder={
                    planningType === 'bug_fix'
                      ? 'Describe the bug...'
                      : planningType === 'feature_refactor'
                      ? 'Which feature needs improvement?'
                      : 'Describe your feature idea...'
                  }
                  onCancel={isLoading ? () => { cancelRef.current?.(); cancelRef.current = null; setIsLoading(false); } : undefined}
                />
              </div>
              {/* Auto-added confirmation banner */}
              {autoAddedItems.length > 0 && (
                <div className="px-4 py-2 border-t border-border bg-success/10">
                  {autoAddedItems.map((title, i) => (
                    <p key={i} className="text-sm text-success flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      "{title}" added to backlog
                    </p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-ink-muted">
              <div className="text-center">
                <svg
                  className="w-12 h-12 mx-auto mb-4 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <p className="text-sm">Select a chat or start a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatListItem({
  chat,
  isActive,
  onClick,
  onDelete,
  onRename,
}: {
  chat: PlanningChat;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editTitle, setEditTitle] = useState(chat.title);

  const messageCount = chat.messages.length;
  const lastMessage = chat.messages[chat.messages.length - 1];
  const preview = lastMessage?.content.slice(0, 50) || 'No messages yet';

  const handleSaveRename = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (editTitle.trim()) {
      onRename(editTitle.trim());
      setIsRenaming(false);
    }
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTitle(chat.title);
    setIsRenaming(false);
  };

  if (isRenaming) {
    return (
      <div className="p-3 bg-surface border border-border">
        <form onSubmit={handleSaveRename} onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="input-inset w-full px-2 py-1 bg-surface-card border border-border text-ink text-sm focus:outline-none focus:ring-1 focus:ring-border-strong"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                handleCancelRename(e as unknown as React.MouseEvent);
              }
            }}
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={handleCancelRename}
              className="px-2 py-1 text-xs text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-solid-primary px-2 py-1 text-xs"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (showDeleteConfirm) {
    return (
      <div className="p-3 bg-surface border border-error/50">
        <p className="text-sm text-ink mb-2">Delete this chat?</p>
        <p className="text-xs text-ink-muted mb-3">This action cannot be undone.</p>
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(false);
            }}
            className="px-2 py-1 text-xs text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="btn-solid-danger px-2 py-1 text-xs"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group relative p-3 cursor-pointer transition-colors ${
        isActive
          ? 'bg-surface border border-border'
          : 'hover:bg-surface/50'
      }`}
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-ink truncate">{chat.title}</h4>
          <p className="text-xs text-ink-muted truncate mt-0.5">{preview}...</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-ink-muted">
              {new Date(chat.updatedAt).toLocaleDateString()}
            </span>
            <span className="text-xs text-ink-muted">
              {messageCount} message{messageCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        {showActions && (
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsRenaming(true);
              }}
              className="p-1 text-ink-muted hover:text-ink transition-colors"
              title="Rename"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
              }}
              className="p-1 text-ink-muted hover:text-error transition-colors"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
