import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import Chat from '../components/Chat';
import { resilientChat, isCancelError } from '../utils/resilient-chat';

const DISCOVERY_SYSTEM_PROMPT = `You are helping a user plan their software project through a natural conversation.

Your approach:
- Ask ONE question at a time, then wait for their response
- Keep your responses short and conversational (2-3 sentences max before your question)
- Build on their previous answers naturally
- Cover these areas through the conversation: target users, core features, tech preferences, MVP scope
- Don't use headers or bullet points - keep it conversational like a chat

When you feel you have enough information (usually after 4-6 exchanges), say "I think I have a good picture now. Ready for me to draft the PRD?" and wait for confirmation.

Remember: One question at a time. Be curious and engaged, not formulaic.`;

const PRD_GENERATION_PROMPT = `Based on our conversation, generate a comprehensive Product Requirements Document (PRD) in markdown format that a developer could actually build from.

## Required Sections:

### 1. Overview
- Product name and one-line description
- Problem statement (what pain point does this solve?)
- Target users (primary and secondary)
- Core value proposition

### 2. User Stories
Write 5-8 specific user stories in the format: "As a [user type], I want to [action] so that [benefit]"

### 3. Feature Specifications
For EACH core MVP feature, include:
- Feature name and description
- User flow (step by step what happens)
- UI components needed
- Data requirements (what needs to be stored/retrieved)
- Acceptance criteria (how do we know it's done?)

### 4. Data Model
Define the key database tables/collections:
- Table name
- Fields with types (id, name: string, created_at: timestamp, etc.)
- Relationships between tables

### 5. API Endpoints
List the main API routes needed:
- Method and path (GET /api/users, POST /api/posts, etc.)
- Brief description of what each does

### 6. Tech Stack
- Frontend: Next.js 14 + TypeScript + Tailwind CSS
- Backend: Next.js API routes + TypeScript
- Database: SQLite / PostgreSQL
- Auth: NextAuth.js
- Hosting: GitHub Pages / Self-hosted

### 7. MVP Scope
- What's IN for v1 (be specific)
- What's OUT for v1 (explicitly list features to defer)

### 8. Open Questions
List any decisions that still need to be made

Output ONLY the PRD markdown, starting with "# [Product Name] - Product Requirements Document". No preamble or explanation.`;

export default function DiscoveryScreen() {
  const {
    currentProject,
    chatMessages,
    addChatMessage,
    updateProject,
    goToHome,
    goToPRDReview,
  } = useAppStore();

  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPRD, setIsGeneratingPRD] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasInitialized = useRef(false);
  const isMountedRef = useRef(true);
  const cancelRef = useRef<(() => void) | null>(null);

  // Detect if Claude's last message signals PRD readiness
  const lastAssistantMessage = [...chatMessages].reverse().find(m => m.role === 'assistant');
  const readyForPRD = !!lastAssistantMessage && (
    lastAssistantMessage.content.toLowerCase().includes('ready for me to draft the prd') ||
    lastAssistantMessage.content.toLowerCase().includes('ready to draft the prd') ||
    lastAssistantMessage.content.toLowerCase().includes('ready for me to generate') ||
    lastAssistantMessage.content.toLowerCase().includes('shall i draft the prd') ||
    lastAssistantMessage.content.toLowerCase().includes('shall i generate the prd') ||
    lastAssistantMessage.content.toLowerCase().includes('want me to draft the prd') ||
    lastAssistantMessage.content.toLowerCase().includes('want me to generate the prd')
  );

  // Track mounted state to prevent updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Build conversation context for Claude
  const buildConversationContext = (messages: typeof chatMessages, newMessage?: string) => {
    // Guard against null project
    if (!currentProject) {
      return '';
    }

    let context = `${DISCOVERY_SYSTEM_PROMPT}\n\nProject: ${currentProject.name}\nInitial Idea: ${currentProject.idea}\n\n`;
    context += 'Conversation so far:\n';

    for (const msg of messages) {
      context += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n\n`;
    }

    if (newMessage) {
      context += `User: ${newMessage}\n\nAssistant:`;
    }

    return context;
  };

  // Initialize conversation with Claude
  useEffect(() => {
    const initializeChat = async () => {
      console.log('[DiscoveryScreen] initializeChat called');
      console.log('[DiscoveryScreen] hasInitialized:', hasInitialized.current);
      console.log('[DiscoveryScreen] currentProject:', currentProject?.name, currentProject?.idea?.substring(0, 50));
      console.log('[DiscoveryScreen] chatMessages.length:', chatMessages.length);

      if (hasInitialized.current || !currentProject?.idea || chatMessages.length > 0) {
        console.log('[DiscoveryScreen] Skipping initialization - already done or no idea');
        return;
      }

      hasInitialized.current = true;
      setIsLoading(true);
      setError(null);

      try {
        console.log('[DiscoveryScreen] Adding user message for idea');
        // Send the initial idea to Claude
        addChatMessage({
          role: 'user',
          content: currentProject.idea,
        });

        const prompt = buildConversationContext([], currentProject.idea);
        console.log('[DiscoveryScreen] Built prompt, length:', prompt.length);
        console.log('[DiscoveryScreen] Calling window.api.claude.chat...');
        console.log('[DiscoveryScreen] projectPath:', currentProject.projectPath);

        const startTime = Date.now();
        const { promise, cancel } = resilientChat.standard(currentProject.projectPath, prompt);
        cancelRef.current = cancel;
        const response = await promise;
        cancelRef.current = null;
        const elapsed = Date.now() - startTime;

        console.log('[DiscoveryScreen] Got response in', elapsed, 'ms');
        console.log('[DiscoveryScreen] Response length:', response?.length);
        console.log('[DiscoveryScreen] Response preview:', response?.substring(0, 200));

        // Check if still mounted before updating state
        if (!isMountedRef.current) {
          console.log('[DiscoveryScreen] Component unmounted, skipping state update');
          return;
        }

        addChatMessage({
          role: 'assistant',
          content: response,
        });
      } catch (err) {
        // Check if still mounted before updating state
        if (!isMountedRef.current) return;
        cancelRef.current = null;
        if (isCancelError(err)) return;

        console.error('[DiscoveryScreen] Failed to initialize chat:', err);
        console.error('[DiscoveryScreen] Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));

        // Show connection error — no offline fallback
        addChatMessage({
          role: 'assistant',
          content: `Unable to connect to Claude. Houston requires an internet connection to work.\n\nPlease check your connection and try again.`,
        });
        setError('Claude connection unavailable. Please check your internet connection.');
      } finally {
        if (isMountedRef.current) {
          console.log('[DiscoveryScreen] Setting isLoading to false');
          setIsLoading(false);
        }
      }
    };

    initializeChat();
  }, [currentProject]);

  const handleSendMessage = async (content: string) => {
    // Guard against null project
    if (!currentProject) {
      setError('No project selected. Please go back and select a project.');
      return;
    }

    // Capture project path at call time to avoid null issues in async operations
    const projectPath = currentProject.projectPath;

    addChatMessage({ role: 'user', content });
    setIsLoading(true);
    setError(null);

    try {
      // Continue conversation
      const prompt = buildConversationContext(chatMessages, content);
      const { promise, cancel } = resilientChat.standard(projectPath, prompt);
      cancelRef.current = cancel;
      const response = await promise;
      cancelRef.current = null;

      // Check if still mounted before updating state
      if (!isMountedRef.current) return;

      addChatMessage({
        role: 'assistant',
        content: response,
      });

    } catch (err) {
      // Check if still mounted before updating state
      if (!isMountedRef.current) return;
      cancelRef.current = null;
      if (isCancelError(err)) return;

      console.error('Failed to get Claude response:', err);
      setError('Failed to get response from Claude. Please try again.');

      addChatMessage({
        role: 'assistant',
        content: 'I had trouble processing that. Could you rephrase or try again?',
      });
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  // Handle PRD generation when the user clicks the "Generate PRD" button
  const handleGeneratePRD = async () => {
    if (!currentProject) {
      setError('No project selected. Please go back and select a project.');
      return;
    }

    const projectPath = currentProject.projectPath;
    setIsGeneratingPRD(true);
    setError(null);

    try {
      const prdPrompt = `${buildConversationContext(chatMessages)}\n\n${PRD_GENERATION_PROMPT}`;
      const { promise, cancel } = resilientChat.long(projectPath, prdPrompt);
      cancelRef.current = cancel;
      const prdResponse = await promise;
      cancelRef.current = null;

      if (!isMountedRef.current) return;

      // Extract the PRD markdown from Claude's response
      let prdContent = prdResponse;
      const headingIndex = prdResponse.indexOf('\n# ');
      if (headingIndex !== -1) {
        prdContent = prdResponse.substring(headingIndex + 1);
      } else if (prdResponse.startsWith('# ')) {
        prdContent = prdResponse;
      } else {
        // Claude may have written the PRD as a file via tool use instead of returning it inline.
        // Check the project directory for PRD.md as a fallback.
        console.warn('[DiscoveryScreen] PRD response has no markdown headings, checking project directory for PRD.md');
        try {
          const filePrd = await window.api.fs.readFile(`${projectPath}/PRD.md`);
          if (filePrd && typeof filePrd === 'string' && filePrd.includes('# ')) {
            console.log('[DiscoveryScreen] Found full PRD at project PRD.md');
            prdContent = filePrd;
          }
        } catch {
          // No file found, use the response as-is
        }
      }

      // Save PRD to file and advance project status
      await window.api.storage.savePRD(currentProject.slug, prdContent.trim());
      await updateProject({ status: 'prd_review' });

      // Navigate to PRD review screen
      goToPRDReview();
    } catch (err) {
      if (!isMountedRef.current) return;
      cancelRef.current = null;
      if (isCancelError(err)) {
        setIsGeneratingPRD(false);
        return;
      }

      console.error('Failed to generate PRD:', err);
      setError('Failed to generate PRD. Please try again.');
      setIsGeneratingPRD(false);
    }
  };

  // Show loading overlay when generating PRD
  if (isGeneratingPRD) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-surface-card">
        <div className="text-center">
          <div className="mb-6">
            <div className="w-12 h-12 border-4 border-accent border-t-transparent animate-spin mx-auto" />
          </div>
          <h2 className="text-base font-sans font-semibold text-ink mb-2">Generating Your PRD</h2>
          <p className="text-ink-muted max-w-md">
            Creating a comprehensive Product Requirements Document based on our conversation...
          </p>
          <p className="text-ink-muted text-sm mt-4">This usually takes 15-30 seconds</p>
          <button
            onClick={() => { cancelRef.current?.(); setIsGeneratingPRD(false); }}
            className="mt-6 text-sm text-ink-muted hover:text-error transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-surface-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={goToHome}
              className="text-ink-muted hover:text-ink transition-colors no-drag"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-sans font-bold text-ink">{currentProject?.name}</h1>
              <p className="text-ink-muted text-sm">Discovery Phase - Let's refine your idea</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-ink-muted">Step 1 of 4</span>
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-accent"></div>
              <div className="w-2 h-2 bg-border"></div>
              <div className="w-2 h-2 bg-border"></div>
              <div className="w-2 h-2 bg-border"></div>
            </div>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-error/10 border-b border-error/30 px-6 py-3">
          <div className="flex items-center text-error">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Chat section */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Chat
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            placeholder="Describe your requirements or ask questions..."
            hideInput={readyForPRD}
            onCancel={isLoading ? () => { cancelRef.current?.(); setIsLoading(false); } : undefined}
          />
        </div>

        {/* Generate PRD button - shown when Claude signals readiness */}
        {readyForPRD && !isLoading && (
          <div className="border-t border-border p-6 bg-surface-card/50">
            <div className="flex flex-col items-center space-y-3">
              <p className="text-ink-muted text-sm">Claude has enough info to create your PRD</p>
              <button
                onClick={handleGeneratePRD}
                className="btn-solid-primary px-8 py-3 font-semibold text-lg"
              >
                Generate PRD
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
