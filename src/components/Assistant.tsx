import { useState, useCallback, useRef, useEffect } from 'react';
import Chat from './Chat';
import { useAppStore } from '../store/useAppStore';
import { useActiveProjectStore } from '../store/ProjectStoreContext';
import { projectStoreRegistry } from '../store/projectStoreRegistry';
import {
  extractBacklogSuggestions,
  extractBacklogUpdates,
  extractBacklogRemoves,
  extractBacklogPlans,
  extractSprintCreates,
  extractSprintAssigns,
  extractExecuteTasks,
  extractBuildContinue,
  extractBuildStop,
  extractBuildPauseTiers,
  extractStartBuild,
  stripDirectiveBlocks,
} from '../utils/planning';
import { deriveAssistantMood, getMoodButtonClasses } from '../utils/assistantMood';
import { buildErrorDiagnostic } from '../utils/assistantMessages';
import { resilientChat, isCancelError } from '../utils/resilient-chat';
import type { ChatMessage, HumanTask } from '../types';
import { clearProjectChat, getProjectChat } from '../utils/assistant-chat-state';
import { classifyInteractionDepth } from '../utils/interaction-depth';
import mcAvatar from '../assets/mc-avatar.webp';

const WELCOME_CONTENT = "Hey! I'm your project assistant. Ask me anything about your code, tasks, or architecture.";

function makeWelcomeMessage(): ChatMessage {
  return {
    id: 'mc-welcome',
    role: 'assistant',
    content: WELCOME_CONTENT,
    timestamp: new Date(),
  };
}

// UI-chrome state stays global (panel open/expanded is not per-project)
let _isOpen = false;
let _isExpanded = false;

const PRD_CHAR_LIMIT = 4000;

async function buildPrompt(
  userMessage: string,
  history: ChatMessage[],
  /** Pass the slug at call time to avoid stale closure on rapid project switch */
  slug?: string | null,
): Promise<string> {
  const activeSlug = slug ?? useAppStore.getState().activeProjectSlug;
  const store = activeSlug ? projectStoreRegistry.get(activeSlug) : undefined;
  if (!store) return userMessage;
  const { currentProject, tasks, backlog, sprints, assistantApproval, assistantErrorContext: errorCtx, buildSessionActive } = store.getState();
  if (!currentProject) return userMessage;

  const humanTasks = currentProject.humanTasks ?? [];

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

  // Backlog section — include IDs, sprint assignment, story points, plan status
  const backlogLines = backlog.length > 0
    ? backlog.map((b) => {
        let line = `- [id:${b.id}] [${b.priority}] ${b.title}`;
        if (b.description) line += ` — ${b.description}`;
        if (b.storyPoints) line += ` (${b.storyPoints}sp)`;
        if (b.sprintId) {
          const sprint = sprints.find((s) => s.id === b.sprintId);
          line += ` [sprint: ${sprint?.name ?? b.sprintId}]`;
        }
        if (b.prdStatus === 'complete') line += ' [has plan]';
        if (b.notes) line += ` [notes: ${b.notes}]`;
        return line;
      }).join('\n')
    : '(none)';

  // Sprints section — include IDs and status
  const sprintLines = sprints.length > 0
    ? sprints.map((s) => {
        const itemCount = backlog.filter((b) => b.sprintId === s.id).length;
        return `- [id:${s.id}] ${s.name} (${itemCount} items, ${s.status})`;
      }).join('\n')
    : '(none)';

  // Conversation history (skip welcome message)
  const conversationLines = history
    .filter((m) => m.id !== 'mc-welcome')
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  // PRD section (truncate if needed)
  const prdSection = prd
    ? prd.length > PRD_CHAR_LIMIT
      ? prd.substring(0, PRD_CHAR_LIMIT) + '\n... (truncated)'
      : prd
    : '(none)';

  return `You are a casual and friendly project assistant for Mission Control, working on "${currentProject.name}".

RULES:
- Answer ONLY what the user asked. Do not volunteer extra information, next steps, or unrequested suggestions.
- Keep responses short — a few sentences is usually enough. Match the depth of the question.
- Be conversational, not formal. Talk like a knowledgeable teammate, not a report generator.
- Only reference the project data below when it's directly relevant to the question.

PLANNING & BACKLOG:
You have full control over the backlog and sprints. Use these directives when the user asks you to make changes. Only use a directive when you have enough detail. Always confirm what you did.

1. ADD a new backlog item:
[BACKLOG_ADD]
Title: [title]
Description: [1-2 sentence description]
Priority: [high/medium/low]
Type: [bug_fix/feature_refactor/new_feature]

2. UPDATE an existing backlog item (include only fields to change):
[BACKLOG_UPDATE]
ItemId: [the item id from reference data]
Title: [new title]
Description: [new description]
Priority: [high/medium/low]
Type: [bug_fix/feature_refactor/new_feature]
Notes: [any notes]
StoryPoints: [number]
SprintId: [sprint id, or "none" to unassign]

3. REMOVE a backlog item:
[BACKLOG_REMOVE]
ItemId: [the item id]

4. Write an implementation PLAN for a backlog item:
[BACKLOG_PLAN]
ItemId: [the item id]
Plan:
[multiline implementation plan / flight plan here]
[/BACKLOG_PLAN]

5. CREATE a new sprint:
[SPRINT_CREATE]
Name: [sprint name]

6. ASSIGN a backlog item to a sprint:
[SPRINT_ASSIGN]
ItemId: [the item id]
SprintId: [the sprint id]

7. EXECUTE a single backlog item as a one-off task (starts a build immediately):
[EXECUTE_TASK]
ItemId: [the item id]

8. Mark a human task complete (existing):
[TASK_COMPLETE]
TaskId: [the task id]

DIRECTIVE RULES:
- Reference items/sprints by their [id:...] from the reference data below.
- Only emit ONE [EXECUTE_TASK] per response. Cannot execute if a build is already active.
- For [BACKLOG_UPDATE], only include fields that are changing.
- For [BACKLOG_PLAN], write a thorough implementation plan between the tags.
${humanTasks.length > 0 ? `
HUMAN TASKS GUIDANCE:
- When the user is working on human tasks, guide them step by step conversationally.
- For each task, explain what to do, provide the relevant links, and wait for confirmation.
- When the user confirms they completed a task, mark it done using EXACTLY this format:

[TASK_COMPLETE]
TaskId: [the task id]

- Only mark a task complete when the user explicitly confirms they've done it.
- If all tasks are done, congratulate them and let them know the preview will be ready.
` : ''}
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
${humanTasks.length > 0 ? `
HUMAN TASKS (setup the user needs to do):
${humanTasks.map(t => `- [${t.status === 'completed' ? 'x' : ' '}] ${t.title} (id: ${t.id}, ${t.service || 'general'})${t.blocksPreview ? ' [BLOCKS PREVIEW]' : ''}\n  ${t.description}${t.links?.map(l => `\n  Link: ${l.label} — ${l.url}`).join('') || ''}`).join('\n')}` : ''}
</reference_data>

BUILD FLOW:
You can control the build pipeline with these directives:

9. APPROVE continuing to the next tier (when a tier completion message appears):
[BUILD_CONTINUE]

10. STOP the build after the current tier:
[BUILD_STOP]

11. START a build for a sprint:
[START_BUILD]
SprintId: [the sprint id]

12. Re-enable tier-by-tier approval (undo auto-continue):
[BUILD_PAUSE_TIERS]
${assistantApproval ? `
IMPORTANT: A tier just completed and the build is paused waiting for approval. The user's response likely relates to whether to continue. If they say yes/continue/looks good/approve, emit [BUILD_CONTINUE]. If they say stop/no/hold, emit [BUILD_STOP].
` : ''}${buildSessionActive ? `
NOTE: A build is currently active. Do not emit [START_BUILD] while a build is running.
` : ''}${errorCtx ? `
BUILD ERROR (needs attention):
Task: "${errorCtx.taskTitle}"
Hint: ${errorCtx.errorHint}${errorCtx.errorOutput ? `
Output (last lines):
\`\`\`
${errorCtx.errorOutput}
\`\`\`` : ''}
Help the user diagnose and decide whether to Retry, Skip, or investigate further.
` : ''}
${conversationLines ? `CONVERSATION:\n${conversationLines}\n` : ''}User: ${userMessage}`;
}

/**
 * Process all Assistant directives from Claude's response.
 * Returns an array of confirmation ChatMessages to append.
 */
function processAssistantDirectives(
  response: string,
  slug: string,
): ChatMessage[] {
  const confirmations: ChatMessage[] = [];
  const store = projectStoreRegistry.get(slug);
  if (!store) return confirmations;

  const mkMsg = (content: string): ChatMessage => ({
    id: `mc-directive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    role: 'assistant',
    content,
    timestamp: new Date(),
  });

  const state = store.getState();

  // ── BACKLOG_UPDATE ──
  for (const upd of extractBacklogUpdates(response)) {
    const item = state.backlog.find((b) => b.id === upd.itemId);
    if (!item) {
      confirmations.push(mkMsg(`Could not find backlog item "${upd.itemId}" to update.`));
      continue;
    }
    const changes: Record<string, unknown> = {};
    if (upd.title !== undefined) changes.title = upd.title;
    if (upd.description !== undefined) changes.description = upd.description;
    if (upd.priority !== undefined) changes.priority = upd.priority;
    if (upd.type !== undefined) changes.type = upd.type;
    if (upd.notes !== undefined) changes.notes = upd.notes;
    if (upd.storyPoints !== undefined) changes.storyPoints = upd.storyPoints;
    if (upd.sprintId !== undefined) {
      changes.sprintId = upd.sprintId === null ? undefined : upd.sprintId;
    }
    store.getState().updateBacklogItem(upd.itemId, changes);
    const fields = Object.keys(changes).join(', ');
    confirmations.push(mkMsg(`Updated "${item.title}" — changed: ${fields}`));
  }

  // ── BACKLOG_REMOVE ──
  for (const rem of extractBacklogRemoves(response)) {
    const item = state.backlog.find((b) => b.id === rem.itemId);
    if (!item) {
      confirmations.push(mkMsg(`Could not find backlog item "${rem.itemId}" to remove.`));
      continue;
    }
    store.getState().removeBacklogItem(rem.itemId);
    confirmations.push(mkMsg(`Removed "${item.title}" from backlog.`));
  }

  // ── BACKLOG_PLAN ──
  for (const plan of extractBacklogPlans(response)) {
    const item = state.backlog.find((b) => b.id === plan.itemId);
    if (!item) {
      confirmations.push(mkMsg(`Could not find backlog item "${plan.itemId}" to add plan.`));
      continue;
    }
    store.getState().updateBacklogItem(plan.itemId, { prd: plan.plan, prdStatus: 'complete' });
    confirmations.push(mkMsg(`Added implementation plan to "${item.title}".`));
  }

  // ── SPRINT_CREATE ──
  for (const sc of extractSprintCreates(response)) {
    store.getState().addSprint(sc.name);
    confirmations.push(mkMsg(`Created sprint "${sc.name}".`));
  }

  // ── SPRINT_ASSIGN ──
  for (const sa of extractSprintAssigns(response)) {
    const item = state.backlog.find((b) => b.id === sa.itemId);
    const sprint = state.sprints.find((s) => s.id === sa.sprintId);
    if (!item) {
      confirmations.push(mkMsg(`Could not find backlog item "${sa.itemId}" for sprint assignment.`));
      continue;
    }
    if (!sprint) {
      confirmations.push(mkMsg(`Could not find sprint "${sa.sprintId}".`));
      continue;
    }
    store.getState().updateBacklogItem(sa.itemId, { sprintId: sa.sprintId });
    confirmations.push(mkMsg(`Assigned "${item.title}" to sprint "${sprint.name}".`));
  }

  // ── BUILD_CONTINUE ──
  if (extractBuildContinue(response)) {
    // Only act if approval is still pending (not already handled by BuildScreen banner)
    if (store.getState().assistantApproval) {
      store.getState().clearAssistantApproval();
      const resumeFn = store.getState().buildPipelineResume;
      if (resumeFn) {
        resumeFn();
        confirmations.push(mkMsg('Continuing to the next tier.'));
      } else {
        confirmations.push(mkMsg('No active build to resume.'));
      }
    }
  }

  // ── BUILD_STOP ──
  if (extractBuildStop(response)) {
    if (store.getState().assistantApproval) {
      store.getState().clearAssistantApproval();
    }
    confirmations.push(mkMsg('Build stopped. You can resume from the Build screen.'));
  }

  // ── BUILD_PAUSE_TIERS (re-enable tier-by-tier approval) ──
  if (extractBuildPauseTiers(response)) {
    const setAutoApprove = store.getState().buildPipelineAutoApprove;
    if (setAutoApprove) {
      setAutoApprove(false);
      confirmations.push(mkMsg('Auto-continue disabled — I\'ll check in after each tier.'));
    }
  }

  // ── START_BUILD ──
  const startBuilds = extractStartBuild(response);
  if (startBuilds.length > 0) {
    const sb = startBuilds[0];
    if (state.buildSessionActive) {
      confirmations.push(mkMsg('A build is already running — can\'t start another.'));
    } else {
      // Try matching by ID or by name
      const sprint = state.sprints.find(s => s.id === sb.sprintId)
        || state.sprints.find(s => s.name.toLowerCase() === sb.sprintId.toLowerCase());
      if (!sprint) {
        confirmations.push(mkMsg(`Could not find sprint "${sb.sprintId}".`));
      } else {
        store.getState().startBuild(sprint.id);
        confirmations.push(mkMsg(`Starting build for "${sprint.name}". Heading to the build screen...`));
      }
    }
  }

  // ── EXECUTE_TASK (only first one) ──
  const execTasks = extractExecuteTasks(response);
  if (execTasks.length > 0) {
    const exec = execTasks[0];
    const item = state.backlog.find((b) => b.id === exec.itemId);
    if (!item) {
      confirmations.push(mkMsg(`Could not find backlog item "${exec.itemId}" to execute.`));
    } else if (state.buildSessionActive) {
      confirmations.push(mkMsg(`A build is already running — can't execute "${item.title}" right now.`));
    } else {
      // Create a temporary Task from the BacklogItem
      const tempTask = {
        id: `oneoff-${item.id}-${Date.now()}`,
        title: item.title,
        description: item.description,
        completed: false,
        interactionDepth: item.interactionDepth ?? classifyInteractionDepth(item),
      };
      store.getState().setTasksTransient([tempTask]);
      store.getState().setOneOffBacklogItemId(item.id);
      store.getState().goToBuilding();
      confirmations.push(mkMsg(`Executing "${item.title}" as a one-off task. Heading to the build screen...`));
    }
  }

  return confirmations;
}

export default function Assistant() {
  // Read currentProject first — slug drives per-project state lookup
  const currentProject = useActiveProjectStore((s) => s.currentProject);
  const gamificationEvent = useActiveProjectStore((s) => s.gamificationEvent);

  const slug = currentProject?.slug ?? null;
  const projectChat = slug ? getProjectChat(slug) : null;

  const [isOpen, _setIsOpen] = useState(_isOpen);
  const [isExpanded, _setIsExpanded] = useState(_isExpanded);
  const [messages, _setMessages] = useState<ChatMessage[]>(projectChat?.messages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  // Swap messages when the project slug changes (useState initializer only runs on mount)
  const prevSlugRef = useRef<string | null>(slug);
  useEffect(() => {
    if (slug === prevSlugRef.current) return;
    prevSlugRef.current = slug;
    _setMessages(slug ? getProjectChat(slug).messages : []);
  }, [slug]);

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
      if (slug) {
        getProjectChat(slug).messages = next;
      }
      return next;
    });
  }, [slug]);
  const buildTaskPhase = useActiveProjectStore((s) => s.buildTaskPhase);
  const buildSessionActive = useActiveProjectStore((s) => s.buildSessionActive);

  // Track unread proactive messages for badge
  const [unreadCount, setUnreadCount] = useState(0);

  // Poll for unread proactive messages (lightweight — just reads an int)
  useEffect(() => {
    if (!slug || isOpen) {
      setUnreadCount(0);
      return;
    }
    const interval = setInterval(() => {
      const chat = getProjectChat(slug);
      setUnreadCount(chat.unreadProactiveCount);
    }, 1000);
    return () => clearInterval(interval);
  }, [slug, isOpen]);

  // Greeting flag: true for 3s when project loads
  const [isGreeting, setIsGreeting] = useState(false);
  const prevProjectRef = useRef<string | null>(null);

  useEffect(() => {
    const slug = currentProject?.slug ?? null;
    if (slug && prevProjectRef.current !== slug) {
      setIsGreeting(true);
      const timer = setTimeout(() => setIsGreeting(false), 3000);
      prevProjectRef.current = slug;
      return () => clearTimeout(timer);
    }
    if (!slug) prevProjectRef.current = null;
  }, [currentProject?.slug]);

  // Derive mood
  const mood = deriveAssistantMood({
    gamificationEvent,
    buildTaskPhase,
    buildSessionActive,
    isLoading,
    isGreeting,
  });
  const moodClasses = getMoodButtonClasses(mood);

  // Auto-open Assistant when a build error occurs with a diagnostic message
  const assistantErrorContext = useActiveProjectStore((s) => s.assistantErrorContext);
  const clearAssistantErrorContext = useActiveProjectStore((s) => s.clearAssistantErrorContext);

  useEffect(() => {
    if (!assistantErrorContext || !slug) return;

    // Ensure project chat is initialized
    const chat = getProjectChat(slug);
    if (!chat.hasOpened) {
      chat.hasOpened = true;
      setMessages([makeWelcomeMessage()]);
    }

    // Inject diagnostic message with error output
    const diagnosticMsg: ChatMessage = {
      id: `mc-diag-${assistantErrorContext.timestamp}`,
      role: 'assistant',
      content: buildErrorDiagnostic(assistantErrorContext.taskTitle, assistantErrorContext.errorHint, assistantErrorContext.errorOutput),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, diagnosticMsg]);

    // Open the panel
    setIsOpen(true);

    // Clear the error context so it doesn't re-trigger
    clearAssistantErrorContext();
  }, [assistantErrorContext, slug, setIsOpen, setMessages, clearAssistantErrorContext]);

  // Auto-open Assistant when a tier completes (approval gate)
  const assistantApproval = useActiveProjectStore((s) => s.assistantApproval);

  useEffect(() => {
    if (!assistantApproval || !slug) return;

    // Ensure project chat is initialized
    const chat = getProjectChat(slug);
    if (!chat.hasOpened) {
      chat.hasOpened = true;
      setMessages([makeWelcomeMessage()]);
    }

    // Build a rich tier completion message
    const { taskTitle, completedCount, totalCount, remaining, tierCompletedTaskTitles, diffStat, reviewSummary } = assistantApproval;
    const taskList = tierCompletedTaskTitles.length > 0
      ? tierCompletedTaskTitles.map(t => `- ${t}`).join('\n')
      : '';
    let tierMsg = `**${taskTitle} complete** — ${completedCount}/${totalCount} tasks done, ${remaining} remaining.`;
    if (taskList) tierMsg += `\n\nCompleted in this tier:\n${taskList}`;
    if (diffStat) tierMsg += `\n\n**Diff:** ${diffStat}`;
    if (reviewSummary) tierMsg += `\n\n**Review:** ${reviewSummary}`;
    tierMsg += '\n\nShould I continue to the next tier? (say "yes", "continue", or "stop here")';

    const approvalMsg: ChatMessage = {
      id: `mc-approval-${Date.now()}`,
      role: 'assistant',
      content: tierMsg,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, approvalMsg]);
    setIsOpen(true);
    // Note: approval state is NOT cleared here — it clears when the user responds
    // via [BUILD_CONTINUE]/[BUILD_STOP] directive or via BuildScreen banner click.
  }, [assistantApproval, slug, setIsOpen, setMessages]);

  // Auto-open Assistant when human tasks are pending
  const assistantHumanTaskContext = useActiveProjectStore((s) => s.assistantHumanTaskContext);
  const clearAssistantHumanTaskContext = useActiveProjectStore((s) => s.clearAssistantHumanTaskContext);

  useEffect(() => {
    if (!assistantHumanTaskContext || !slug) return;

    const { tasks: htTasks } = assistantHumanTaskContext;
    if (htTasks.length === 0) {
      clearAssistantHumanTaskContext();
      return;
    }

    // Ensure project chat is initialized
    const chat = getProjectChat(slug);
    if (!chat.hasOpened) {
      chat.hasOpened = true;
      setMessages([makeWelcomeMessage()]);
    }

    const projectName = currentProject?.name || 'your project';
    const firstTask = htTasks[0];
    const openingMsg: ChatMessage = {
      id: `mc-human-tasks-${assistantHumanTaskContext.timestamp}`,
      role: 'assistant',
      content: `Hey! While I build ${projectName}, there ${htTasks.length === 1 ? 'is 1 thing' : `are ${htTasks.length} things`} you'll need to set up. Ready to start with "${firstTask.title}"?`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, openingMsg]);
    setIsOpen(true);
    clearAssistantHumanTaskContext();
  }, [assistantHumanTaskContext, slug, currentProject?.name, setIsOpen, setMessages, clearAssistantHumanTaskContext]);

  // Expose window.openAssistant() so other screens can open it
  useEffect(() => {
    window.openAssistant = () => {
      if (slug) {
        const chat = getProjectChat(slug);
        if (!chat.hasOpened) {
          chat.hasOpened = true;
          setMessages([makeWelcomeMessage()]);
        }
      }
      setIsOpen(true);
    };
    return () => {
      delete window.openAssistant;
    };
  }, [slug, setIsOpen, setMessages]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next && slug) {
        const chat = getProjectChat(slug);
        if (!chat.hasOpened) {
          chat.hasOpened = true;
          chat.messages = [makeWelcomeMessage(), ...chat.messages.filter((m) => m.id !== 'mc-welcome')];
        }
        // Sync proactive messages queued while panel was closed
        setMessages([...chat.messages]);
        chat.unreadProactiveCount = 0;
      }
      return next;
    });
  }, [slug, setIsOpen, setMessages]);

  const cancelRef = useRef<(() => void) | null>(null);

  const handleSend = useCallback(async (content: string) => {
    if (!currentProject) return;

    const userMsg: ChatMessage = {
      id: `mc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setStreamingContent('');

    try {
      // Capture slug now to avoid stale closure if project switches during the await
      const promptSlug = currentProject?.slug ?? null;
      const prompt = await buildPrompt(content, [...messagesRef.current, userMsg], promptSlug);
      const { promise, cancel, chatId } = resilientChat.standard(currentProject.projectPath, prompt, { streaming: true });
      cancelRef.current = cancel;

      // Subscribe to streaming text chunks
      window.api.claude.onChatOutputForTask(chatId, (chunk: string) => {
        setStreamingContent((prev) => prev + chunk);
      });

      const response = await promise;
      cancelRef.current = null;

      // Clean up streaming subscription
      window.api.claude.offChatOutputForTask(chatId);
      setStreamingContent('');

      // Strip directive blocks from displayed message (keep raw response for extraction)
      const displayContent = stripDirectiveBlocks(response);
      const assistantMsg: ChatMessage = {
        id: `mc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: displayContent || response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Extract backlog items from response and auto-add
      const suggestions = extractBacklogSuggestions(response);
      if (suggestions.length > 0) {
        const activeStore = slug ? projectStoreRegistry.get(slug) : undefined;
        const addBacklogItem = activeStore?.getState().addBacklogItem;
        if (!addBacklogItem) return;
        for (const s of suggestions) {
          addBacklogItem({
            title: s.title,
            description: s.description,
            priority: s.priority,
            type: s.type || undefined,
          });
        }
        const confirmMsg: ChatMessage = {
          id: `mc-confirm-${Date.now()}`,
          role: 'assistant',
          content: `Added to backlog: ${suggestions.map((s) => `"${s.title}"`).join(', ')}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, confirmMsg]);
      }

      // Extract [TASK_COMPLETE] blocks and mark human tasks done
      const taskCompleteRegex = /\[TASK_COMPLETE\]\s*\n+\s*TaskId:\s*(.+)/g;
      let tcMatch;
      while ((tcMatch = taskCompleteRegex.exec(response)) !== null) {
        const taskId = tcMatch[1].trim();
        const tcStore = slug ? projectStoreRegistry.get(slug) : undefined;
        if (!tcStore) break;
        const { currentProject: cp, updateProject: up } = tcStore.getState();
        const ht = cp?.humanTasks?.find((t) => t.id === taskId);
        if (ht && cp?.humanTasks) {
          const updatedTasks = cp.humanTasks.map((t) =>
            t.id === taskId ? { ...t, status: 'completed' as const, completedAt: new Date().toISOString() } : t
          );
          up({ humanTasks: updatedTasks });
          const completeMsg: ChatMessage = {
            id: `mc-task-done-${Date.now()}-${taskId}`,
            role: 'assistant',
            content: `Marked "${ht.title}" as complete!`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, completeMsg]);
        }
      }

      // Process all new directives (update, remove, plan, sprint, execute)
      if (slug) {
        const directiveMsgs = processAssistantDirectives(response, slug);
        if (directiveMsgs.length > 0) {
          setMessages((prev) => [...prev, ...directiveMsgs]);
        }
      }
    } catch (err) {
      cancelRef.current = null;
      setStreamingContent('');
      if (isCancelError(err)) return;

      const errorMsg: ChatMessage = {
        id: `mc-err-${Date.now()}`,
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
    cancelRef.current?.();
    cancelRef.current = null;
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
              <div className="w-5 h-5 rounded-full overflow-hidden border-2 border-accent"><img src={mcAvatar} alt="Assistant" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" /></div>
              <span className="font-display text-sm font-semibold tracking-wide text-ink">Assistant</span>
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
                aria-label={isExpanded ? 'Compact chat' : 'Expand chat'}
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
                aria-label="Minimize chat"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Chat body */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0" role="log" aria-live="polite">
            <Chat
              messages={messages}
              onSendMessage={handleSend}
              isLoading={isLoading}
              streamingContent={streamingContent}
              placeholder="Ask anything..."
            />
          </div>
        </div>
      )}

      {/* Floating button (always visible) */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={handleToggle}
          className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 overflow-hidden border-[3px] ${moodClasses} hover:shadow-[0_0_14px_rgba(82,158,214,0.6)]`}
          title="Ask"
          aria-label="Ask"
        >
          <img src={mcAvatar} alt="Assistant" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
        </button>
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-spectrum-red text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>
    </>
  );
}
