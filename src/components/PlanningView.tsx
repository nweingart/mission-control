import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import Chat from './Chat';
import { extractBacklogSuggestions } from '../utils/planning';
import type { Task, TaskPhase, PlanningType } from '../types';

interface PlanningViewProps {
  tasks: Task[];
  prd: string;
  currentTaskId: string | null;
  taskPhase: TaskPhase;
  isBuilding: boolean;
}

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
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 21a2 2 0 01-2-2h4a2 2 0 01-2 2zm-4-4h8v-1.5H8V17zm.5-3h7a4.5 4.5 0 00.88-2H7.62a4.5 4.5 0 00.88 2zM19 10h2v2h-2a7.02 7.02 0 00-1.28-3.19l1.42-1.42-1.42-1.42-1.42 1.42A6.98 6.98 0 0013 5.08V3h-2v2.08a6.98 6.98 0 00-3.3 1.31L6.28 4.97 4.86 6.39l1.42 1.42A7.02 7.02 0 005 12H3v-2h2" />
      </svg>
    ),
    label: 'Fix Bug',
    description: 'Something broke — let\'s find it and fix it',
    color: '#CC4434',
    bgColor: 'rgba(204,68,52,0.10)',
    borderColor: 'rgba(204,68,52,0.30)',
  },
  {
    type: 'feature_refactor',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6-3.4 3.4-1.6-1.6a1 1 0 00-1.4 0l-4.3 4.3a1 1 0 000 1.4l2.6 2.6a1 1 0 001.4 0l4.3-4.3a1 1 0 000-1.4l-1.6-1.6 3.4-3.4 1.6 1.6a1 1 0 001.4 0l2-2a1 1 0 000-1.4l-2.6-2.6a1 1 0 00-1.4 0l-2 2z" />
      </svg>
    ),
    label: 'Refactor Existing',
    description: 'Clean up, rework, or improve what\'s already there',
    color: '#3E8AC2',
    bgColor: 'rgba(62,138,194,0.10)',
    borderColor: 'rgba(62,138,194,0.30)',
  },
  {
    type: 'new_feature',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9.5 2A1.5 1.5 0 008 3.5V4H5.5A1.5 1.5 0 004 5.5v13A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0018.5 4H16v-.5A1.5 1.5 0 0014.5 2h-5zM12 8a.75.75 0 01.75.75v2.5h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5h-2.5a.75.75 0 010-1.5h2.5v-2.5A.75.75 0 0112 8z" />
      </svg>
    ),
    label: 'New Feature',
    description: 'Add something that doesn\'t exist yet',
    color: '#449256',
    bgColor: 'rgba(68,146,86,0.10)',
    borderColor: 'rgba(68,146,86,0.30)',
  },
];

function getTypeIcon(type: PlanningType) {
  return PLANNING_TYPE_OPTIONS.find((o) => o.type === type)?.icon;
}

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
    getActivePlanningMessages,
    addBacklogItem,
    loadBacklog,
    createPlanningChat,
    setActivePlanningChat,
    addPlanningMessage,
    loadPlanningChats,
  } = useAppStore();

  const [isLoading, setIsLoading] = useState(false);
  const [planningType, setPlanningType] = useState<PlanningType | null>(null);
  const [autoAddedItems, setAutoAddedItems] = useState<string[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
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

      // If no active chat, select the most recent (but don't auto-create)
      const { planningChats: chats, activePlanningChatId: activeId } = useAppStore.getState();
      if (!activeId && chats.length > 0) {
        const sorted = [...chats].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setActivePlanningChat(sorted[0].id);
      }

      if (isMountedRef.current) {
        setIsInitializing(false);
      }
    };

    init();
  }, [loadBacklog, loadPlanningChats, setActivePlanningChat]);

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

  // Build the system prompt for Claude (type-aware)
  const buildSystemPrompt = useCallback(() => {
    const v1Features = tasks.map((t) => `- ${t.title}${t.completed ? ' (completed)' : ''}`).join('\n');
    const backlogFeatures = backlog.length > 0
      ? `\n\nCurrent backlog:\n${backlog.map((b) => `- [${b.priority}] ${b.title}`).join('\n')}`
      : '';

    return buildTypeSystemPrompt(
      planningType || 'new_feature',
      currentProject?.name || 'this project',
      prd,
      v1Features,
      backlogFeatures
    );
  }, [currentProject?.name, prd, tasks, backlog, planningType]);

  // Handle sending a message
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!currentProject || isLoading) return;

      let chatId = activePlanningChatId;
      if (!chatId) {
        chatId = createPlanningChat();
      }

      addPlanningMessage({ role: 'user', content });
      setIsLoading(true);

      try {
        const systemPrompt = buildSystemPrompt();
        const messages = useAppStore.getState().getActivePlanningMessages();
        const conversationHistory = messages
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n');

        const fullPrompt = `${systemPrompt}

Conversation so far:
${conversationHistory}

User: ${content}

Respond as the assistant. Be helpful and conversational.`;

        const response = await window.api.claude.chat(currentProject.projectPath, fullPrompt);

        if (!isMountedRef.current) return;

        addPlanningMessage({ role: 'assistant', content: response });

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
          setAutoAddedItems(suggestions.map((s) => s.title));
          setTimeout(() => {
            if (isMountedRef.current) setAutoAddedItems([]);
          }, 4000);
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
      addBacklogItem,
      buildSystemPrompt,
      planningType,
    ]
  );

  // Resume an existing chat
  const handleResumeChat = useCallback(
    (chatId: string) => {
      setActivePlanningChat(chatId);
      // Infer type from chat title, fallback to new_feature
      const chat = planningChats.find((c) => c.id === chatId);
      if (chat) {
        if (chat.title.startsWith('Bug Fix')) setPlanningType('bug_fix');
        else if (chat.title.startsWith('Feature Refactor')) setPlanningType('feature_refactor');
        else setPlanningType('new_feature');
      } else {
        setPlanningType('new_feature');
      }
      setAutoAddedItems([]);
    },
    [setActivePlanningChat, planningChats]
  );

  // Handle starting a new chat — reset type selector
  const handleNewChat = useCallback(() => {
    setPlanningType(null);
    setAutoAddedItems([]);
  }, []);

  // Show loading state during initialization
  if (isInitializing) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent animate-spin mx-auto mb-3"></div>
          <p className="text-ink-muted text-sm">Loading planning data...</p>
        </div>
      </div>
    );
  }

  // Sort chats by most recent
  const sortedChats = [...planningChats].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const renderSessionRow = (chat: typeof sortedChats[0]) => {
    const messageCount = chat.messages.length;
    const lastMessage = chat.messages[chat.messages.length - 1];
    const preview = lastMessage?.content.slice(0, 60) || 'No messages yet';
    return (
      <button
        key={chat.id}
        onClick={() => { handleResumeChat(chat.id); setShowAllSessions(false); }}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-card transition-colors group"
      >
        <div className="w-8 h-8 bg-border/50 text-ink-muted flex items-center justify-center flex-shrink-0 group-hover:bg-accent/10 group-hover:text-accent transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink truncate">{chat.title}</p>
          <p className="text-xs text-ink-muted truncate">{preview}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-xs text-ink-muted">{new Date(chat.updatedAt).toLocaleDateString()}</p>
          <p className="text-xs text-ink-muted/60">{messageCount} msg{messageCount !== 1 ? 's' : ''}</p>
        </div>
      </button>
    );
  };

  // All sessions view
  if (!planningType && showAllSessions) {
    const visibleChats = sortedChats.slice(0, visibleCount);
    const hasMore = sortedChats.length > visibleCount;

    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-sans font-semibold text-ink">All Sessions</h3>
            <button
              onClick={() => setShowAllSessions(false)}
              className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          </div>
          <div className="space-y-1">
            {visibleChats.map(renderSessionRow)}
          </div>
          {hasMore && (
            <button
              onClick={() => setVisibleCount((c) => c + 10)}
              className="btn-solid w-full mt-3 py-2 text-xs font-medium text-ink-muted hover:text-ink text-center transition-colors"
            >
              Show more ({sortedChats.length - visibleCount} remaining)
            </button>
          )}
        </div>
      </div>
    );
  }

  // Type selector screen
  if (!planningType) {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-10">
          <h3 className="text-xl font-sans font-bold text-ink mb-1">What would you like to plan?</h3>
          <p className="text-sm text-ink-muted mb-8">Choose a type to start a new conversation</p>
          <div className="flex gap-5 w-full max-w-3xl">
            {PLANNING_TYPE_OPTIONS.map((option) => (
              <button
                key={option.type}
                onClick={() => handleTypeSelect(option.type)}
                className="flex-1 flex flex-col items-start gap-4 p-6 bg-surface-light rounded-lg transition-all group overflow-hidden relative hover:-translate-y-1"
                style={{
                  border: `2px solid ${option.borderColor}`,
                  boxShadow: '0 2px 8px rgba(44,38,32,0.07), 0 1px 3px rgba(44,38,32,0.05)',
                  minHeight: '180px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 12px 32px ${option.borderColor}, 0 4px 12px rgba(44,38,32,0.08)`;
                  e.currentTarget.style.borderColor = option.color;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(44,38,32,0.07), 0 1px 3px rgba(44,38,32,0.05)';
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
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-bold text-ink">{option.label}</span>
                  <span className="text-sm text-ink-secondary leading-relaxed text-left">{option.description}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent sessions */}
        {sortedChats.length > 0 && (
          <div className="border-t border-border px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-sans font-medium text-ink-muted">Recent Sessions</h4>
              {sortedChats.length > 3 && (
                <button
                  onClick={() => { setShowAllSessions(true); setVisibleCount(10); }}
                  className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                >
                  View all ({sortedChats.length})
                </button>
              )}
            </div>
            <div className="space-y-1">
              {sortedChats.slice(0, 3).map(renderSessionRow)}
            </div>
          </div>
        )}
      </div>
    );
  }

  const activeOption = PLANNING_TYPE_OPTIONS.find((o) => o.type === planningType);

  return (
    <div className="flex-1 min-h-0 flex flex-col card-panel overflow-hidden">
      {/* Chat header */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-accent/10 text-accent flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4">
            {getTypeIcon(planningType)}
          </div>
          <div>
            <h3 className="text-base font-sans font-semibold text-ink">{activeOption?.label}</h3>
            <p className="text-xs text-ink-muted">
              {isBuilding ? 'Build in progress — plan future work' : 'Brainstorm next steps'}
            </p>
          </div>
        </div>
        <button
          onClick={handleNewChat}
          className="btn-solid px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink transition-colors"
        >
          New Chat
        </button>
      </div>

      {/* Chat messages */}
      <div className="flex-1 min-h-0 overflow-hidden">
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
        />
      </div>

      {/* Auto-added confirmation banner */}
      {autoAddedItems.length > 0 && (
        <div className="px-5 py-2.5 border-t border-border bg-success/10">
          {autoAddedItems.map((title, i) => (
            <p key={i} className="text-sm text-success flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              "{title}" added to backlog
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
