import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import Chat from './Chat';
import BacklogSidebar from './BacklogSidebar';
import { extractBacklogSuggestions, type BacklogSuggestion } from '../utils/planning';
import type { Task, TaskPhase, BacklogItem, ChatMessage } from '../types';

interface PlanningViewProps {
  tasks: Task[];
  prd: string;
  currentTaskId: string | null;
  taskPhase: TaskPhase;
  isBuilding: boolean;
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

export default function PlanningView({
  tasks,
  prd,
  currentTaskId,
  taskPhase,
  isBuilding,
}: PlanningViewProps) {
  const {
    currentProject,
    backlog,
    planningChats,
    activePlanningChatId,
    planningChatMessages,
    addBacklogItem,
    updateBacklogItem,
    removeBacklogItem,
    saveBacklog,
    loadBacklog,
    createPlanningChat,
    setActivePlanningChat,
    addPlanningMessage,
    savePlanningChats,
    loadPlanningChats,
  } = useAppStore();

  const [isLoading, setIsLoading] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<
    Array<{ title: string; description: string; priority: 'high' | 'medium' | 'low' }>
  >([]);
  const isMountedRef = useRef(true);
  const hasInitializedRef = useRef(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load backlog and planning chats on mount
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const init = async () => {
      await loadBacklog();
      await loadPlanningChats();

      // If no active chat, create one or select the most recent
      const { planningChats: chats, activePlanningChatId: activeId } = useAppStore.getState();
      if (!activeId && chats.length > 0) {
        // Select the most recent chat
        const sorted = [...chats].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setActivePlanningChat(sorted[0].id);
      } else if (!activeId && chats.length === 0) {
        // Create a new chat
        createPlanningChat();
      }

      if (isMountedRef.current) {
        setIsInitializing(false);
      }
    };

    init();
  }, [loadBacklog, loadPlanningChats, setActivePlanningChat, createPlanningChat]);

  // Save backlog when it changes (including when emptied)
  useEffect(() => {
    // Don't save until initialization is complete
    if (isInitializing) return;
    saveBacklog();
  }, [backlog, saveBacklog, isInitializing]);

  // Save planning chats when messages change
  useEffect(() => {
    // Don't save until initialization is complete
    if (isInitializing) return;
    savePlanningChats();
  }, [planningChatMessages, savePlanningChats, isInitializing]);

  // Build the system prompt for Claude
  const buildSystemPrompt = useCallback(() => {
    const v1Features = tasks.map((t) => `- ${t.title}${t.completed ? ' (completed)' : ''}`).join('\n');
    const backlogFeatures = backlog.length > 0
      ? `\n\nCurrent backlog:\n${backlog.map((b) => `- [${b.priority}] ${b.title}`).join('\n')}`
      : '';

    return `You are helping plan V2 features for "${currentProject?.name || 'this project'}".

Context:
- PRD: ${prd || 'Not available'}
- V1 Features being built:
${v1Features || 'None specified'}
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
5. Keep responses concise and conversational

Start by suggesting a few V2 ideas if this is a new conversation.`;
  }, [currentProject?.name, prd, tasks, backlog]);

  // Handle sending a message
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!currentProject || isLoading) return;

      // Ensure we have an active chat
      let chatId = activePlanningChatId;
      if (!chatId) {
        chatId = createPlanningChat();
      }

      // Add user message
      addPlanningMessage({ role: 'user', content });

      setIsLoading(true);
      setPendingSuggestions([]);

      try {
        // Build the full prompt with system context
        const systemPrompt = buildSystemPrompt();
        const messages = useAppStore.getState().planningChatMessages;
        const conversationHistory = messages
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n');

        const fullPrompt = `${systemPrompt}

Conversation so far:
${conversationHistory}

User: ${content}

Respond as the assistant. Be helpful and conversational.`;

        // Call Claude chat API (same as Discovery screen uses)
        const response = await window.api.claude.chat(currentProject.projectPath, fullPrompt);

        if (!isMountedRef.current) return;

        // Add assistant message
        addPlanningMessage({ role: 'assistant', content: response });

        // Check for backlog suggestions in the response
        const suggestions = extractBacklogSuggestions(response);
        if (suggestions.length > 0) {
          setPendingSuggestions(suggestions);
        }
      } catch (err) {
        console.error('Planning chat error:', err);
        if (isMountedRef.current) {
          addPlanningMessage({
            role: 'assistant',
            content: 'Sorry, I encountered an error. Please try again.',
          });
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [
      currentProject,
      activePlanningChatId,
      isLoading,
      createPlanningChat,
      addPlanningMessage,
      buildSystemPrompt,
    ]
  );

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

  // Handle starting a new chat
  const handleNewChat = useCallback(() => {
    createPlanningChat();
    setPendingSuggestions([]);
  }, [createPlanningChat]);

  // Show loading state during initialization
  if (isInitializing) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-terracotta-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-charcoal-400 text-sm">Loading planning data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex gap-4">
      {/* Chat panel */}
      <div className="flex-1 min-h-0 flex flex-col bg-charcoal-800 rounded-lg border border-charcoal-600 overflow-hidden">
        {/* Chat header */}
        <div className="px-4 py-3 border-b border-charcoal-600 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-cream-100">Plan V2 Features</h3>
            <p className="text-xs text-charcoal-400">
              {isBuilding ? 'Build in progress - plan future features' : 'Brainstorm next steps'}
            </p>
          </div>
          <button
            onClick={handleNewChat}
            className="px-3 py-1 text-xs text-charcoal-300 hover:text-cream-100 hover:bg-charcoal-700 rounded transition-colors"
          >
            New Chat
          </button>
        </div>

        {/* Chat messages */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Chat
            messages={planningChatMessages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            placeholder="What V2 features should we plan?"
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
      </div>

      {/* Backlog sidebar */}
      <div className="w-80 min-h-0">
        <BacklogSidebar
          items={backlog}
          onAddItem={addBacklogItem}
          onUpdateItem={updateBacklogItem}
          onRemoveItem={removeBacklogItem}
        />
      </div>
    </div>
  );
}
