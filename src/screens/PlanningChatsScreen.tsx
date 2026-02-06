import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import Chat from '../components/Chat';
import { extractBacklogSuggestions, type BacklogSuggestion } from '../utils/planning';
import type { PlanningChat, BacklogItem } from '../types';

export default function PlanningChatsScreen() {
  const {
    currentProject,
    planningChats,
    activePlanningChatId,
    planningChatMessages,
    loadPlanningChats,
    setActivePlanningChat,
    createPlanningChat,
    addPlanningMessage,
    savePlanningChats,
    goToPreview,
    backlog,
    loadBacklog,
    addBacklogItem,
    deletePlanningChat,
    renamePlanningChat,
  } = useAppStore();

  const [isLoading, setIsLoading] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<
    Array<{ title: string; description: string; priority: 'high' | 'medium' | 'low' }>
  >([]);

  // Load planning chats and backlog on mount
  useEffect(() => {
    loadPlanningChats();
    loadBacklog();
  }, [loadPlanningChats, loadBacklog]);

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
      const currentBacklog = useAppStore.getState().backlog;

      const v1Features = tasks.map((t) => `- ${t.title}`).join('\n') || 'None specified';
      const backlogFeatures = currentBacklog.length > 0
        ? `\n\nCurrent backlog:\n${currentBacklog.map((b) => `- [${b.priority}] ${b.title}`).join('\n')}`
        : '';

      const systemPrompt = `You are helping plan V2 features for "${currentProject.name}".

Context:
- PRD: ${prd || 'Not available'}
- V1 Features being built:
${v1Features}
${backlogFeatures}

Your role:
1. Suggest potential V2 features based on natural extensions of the MVP
2. Discuss ideas conversationally with the user
3. When an idea is ready to add, use this exact format:

**Add to backlog?**
Title: [Feature title]
Description: [1-2 sentence description]
Priority: [high/medium/low]

4. Help prioritize and refine ideas
5. Keep responses concise and conversational`;

      const messages = useAppStore.getState().planningChatMessages;
      const conversationHistory = messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

      const fullPrompt = `${systemPrompt}

Conversation so far:
${conversationHistory}

User: ${content}

Respond as the assistant. Be helpful and conversational.`;

      const response = await window.api.claude.chat(currentProject.projectPath, fullPrompt);
      addPlanningMessage({ role: 'assistant', content: response });

      // Check for backlog suggestions
      const suggestions = extractBacklogSuggestions(response);
      if (suggestions.length > 0) {
        setPendingSuggestions(suggestions);
      }
    } catch (err) {
      console.error('Planning chat error:', err);
      addPlanningMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Save chats when messages change
  useEffect(() => {
    if (planningChatMessages.length > 0) {
      savePlanningChats();
    }
  }, [planningChatMessages, savePlanningChats]);

  // Sort chats by most recent
  const sortedChats = [...planningChats].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const activeChat = planningChats.find((c) => c.id === activePlanningChatId);

  // Handle adding a suggestion to backlog
  const handleAddSuggestion = useCallback(
    (suggestion: { title: string; description: string; priority: 'high' | 'medium' | 'low' }) => {
      addBacklogItem({
        title: suggestion.title,
        description: suggestion.description,
        priority: suggestion.priority,
        chatId: activePlanningChatId || undefined,
      });
      setPendingSuggestions((prev) =>
        prev.filter((s) => s.title !== suggestion.title)
      );
    },
    [addBacklogItem, activePlanningChatId]
  );

  // Handle dismissing a suggestion
  const handleDismissSuggestion = useCallback(
    (suggestion: { title: string }) => {
      setPendingSuggestions((prev) =>
        prev.filter((s) => s.title !== suggestion.title)
      );
    },
    []
  );

  const handleDeleteChat = (chatId: string) => {
    deletePlanningChat(chatId);
    savePlanningChats();
  };

  const handleRenameChat = (chatId: string, newTitle: string) => {
    renamePlanningChat(chatId, newTitle);
    savePlanningChats();
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-charcoal-800 border-b border-charcoal-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={goToPreview}
              className="text-charcoal-300 hover:text-cream-100 transition-colors no-drag"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-cream-100">Planning Chats</h1>
              <p className="text-charcoal-300 text-sm">{currentProject?.name}</p>
            </div>
          </div>
          <button
            onClick={() => createPlanningChat()}
            className="px-4 py-2 bg-terracotta-500 text-charcoal-950 text-sm font-medium rounded-lg hover:bg-terracotta-600 transition-colors no-drag"
          >
            New Chat
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Chat list sidebar */}
        <div className="w-64 border-r border-charcoal-600 bg-charcoal-800 overflow-y-auto">
          <div className="p-3 space-y-1">
            {sortedChats.length === 0 && (
              <div className="text-center py-8 text-charcoal-400">
                <p className="text-sm">No planning chats yet</p>
                <p className="text-xs mt-1">Click "New Chat" to start</p>
              </div>
            )}
            {sortedChats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === activePlanningChatId}
                onClick={() => setActivePlanningChat(chat.id)}
                onDelete={() => handleDeleteChat(chat.id)}
                onRename={(newTitle) => handleRenameChat(chat.id, newTitle)}
              />
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeChat ? (
            <>
              <div className="flex-1 overflow-hidden">
                <Chat
                  messages={planningChatMessages}
                  onSendMessage={handleSendMessage}
                  isLoading={isLoading}
                  placeholder="Continue planning V2 features..."
                />
              </div>
              {/* Pending suggestions */}
              {pendingSuggestions.length > 0 && (
                <div className="px-4 pb-2 border-t border-charcoal-600 pt-2 bg-charcoal-800/50">
                  <p className="text-xs text-charcoal-400 mb-2">Suggested features:</p>
                  {pendingSuggestions.map((suggestion, i) => (
                    <SuggestionCard
                      key={i}
                      suggestion={suggestion}
                      onAdd={() => handleAddSuggestion(suggestion)}
                      onDismiss={() => handleDismissSuggestion(suggestion)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-charcoal-400">
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
      <div className="rounded-lg p-3 bg-charcoal-700 border border-charcoal-500">
        <form onSubmit={handleSaveRename} onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full px-2 py-1 bg-charcoal-800 border border-charcoal-600 rounded text-cream-100 text-sm focus:outline-none focus:ring-1 focus:ring-terracotta-500"
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
              className="px-2 py-1 text-xs text-charcoal-400 hover:text-cream-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-2 py-1 text-xs bg-terracotta-500 text-charcoal-950 rounded hover:bg-terracotta-600"
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
      <div className="rounded-lg p-3 bg-charcoal-700 border border-rust-500/50">
        <p className="text-sm text-cream-100 mb-2">Delete this chat?</p>
        <p className="text-xs text-charcoal-400 mb-3">This action cannot be undone.</p>
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(false);
            }}
            className="px-2 py-1 text-xs text-charcoal-400 hover:text-cream-100"
          >
            Cancel
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="px-2 py-1 text-xs bg-rust-500 text-cream-100 rounded hover:bg-rust-600"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group relative rounded-lg p-3 cursor-pointer transition-colors ${
        isActive
          ? 'bg-charcoal-700 border border-charcoal-500'
          : 'hover:bg-charcoal-700/50'
      }`}
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-cream-100 truncate">{chat.title}</h4>
          <p className="text-xs text-charcoal-400 truncate mt-0.5">{preview}...</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-charcoal-500">
              {new Date(chat.updatedAt).toLocaleDateString()}
            </span>
            <span className="text-xs text-charcoal-500">
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
              className="p-1 text-charcoal-400 hover:text-cream-100 transition-colors"
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
              className="p-1 text-charcoal-400 hover:text-rust-400 transition-colors"
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

function SuggestionCard({
  suggestion,
  onAdd,
  onDismiss,
}: {
  suggestion: { title: string; description: string; priority: 'high' | 'medium' | 'low' };
  onAdd: () => void;
  onDismiss: () => void;
}) {
  const priorityColors = {
    high: 'text-rust-400',
    medium: 'text-terracotta-400',
    low: 'text-sage-400',
  };

  return (
    <div className="bg-charcoal-700 border border-terracotta-500/30 rounded-lg p-3 my-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h4 className="text-sm font-medium text-cream-100">{suggestion.title}</h4>
          {suggestion.description && (
            <p className="text-xs text-charcoal-300 mt-1">{suggestion.description}</p>
          )}
          <span className={`text-xs ${priorityColors[suggestion.priority]} mt-1 inline-block`}>
            {suggestion.priority} priority
          </span>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={onDismiss}
            className="px-2 py-1 text-xs text-charcoal-400 hover:text-cream-100"
          >
            Dismiss
          </button>
          <button
            onClick={onAdd}
            className="px-3 py-1 text-xs bg-terracotta-500 text-charcoal-950 rounded hover:bg-terracotta-600"
          >
            Add to Backlog
          </button>
        </div>
      </div>
    </div>
  );
}
