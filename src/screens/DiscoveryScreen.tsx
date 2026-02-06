import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import Chat from '../components/Chat';

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
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth
- Hosting: Vercel

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
    saveChatHistory,
    updateProject,
    goToHome,
    goToPRDReview,
  } = useAppStore();

  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPRD, setIsGeneratingPRD] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasInitialized = useRef(false);
  const isMountedRef = useRef(true);

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
        const response = await window.api.claude.chat(currentProject.projectPath, prompt);
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

        await saveChatHistory();
        console.log('[DiscoveryScreen] Chat history saved');
      } catch (err) {
        // Check if still mounted before updating state
        if (!isMountedRef.current) return;

        console.error('[DiscoveryScreen] Failed to initialize chat:', err);
        console.error('[DiscoveryScreen] Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));

        // Add a fallback message first, then set error so UI shows consistently
        // Don't show error banner when we have a fallback - it's confusing
        addChatMessage({
          role: 'assistant',
          content: `I'd love to help you build "${currentProject?.name || 'your project'}"! Let me ask a few questions:

1. **Target Users**: Who will be using this app?
2. **Core Features**: What are the 2-3 most important features for the MVP?
3. **Tech Preferences**: Any preferences for the tech stack?

(Note: Running in offline mode - Claude connection unavailable)`,
        });
        // Don't set error state - the fallback message handles the user experience
        // setError would show a redundant error banner above the chat
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
      const response = await window.api.claude.chat(projectPath, prompt);

      // Check if still mounted before updating state
      if (!isMountedRef.current) return;

      addChatMessage({
        role: 'assistant',
        content: response,
      });

      // Check if still mounted before saving
      if (!isMountedRef.current) return;
      await saveChatHistory();
    } catch (err) {
      // Check if still mounted before updating state
      if (!isMountedRef.current) return;

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
      const prdResponse = await window.api.claude.chat(projectPath, prdPrompt);

      if (!isMountedRef.current) return;

      // Save PRD to file
      await window.api.storage.savePRD(currentProject.slug, prdResponse);

      // Update project status
      await updateProject({ status: 'discovery' });
      await saveChatHistory();

      // Navigate to PRD review screen
      goToPRDReview();
    } catch (err) {
      if (!isMountedRef.current) return;

      console.error('Failed to generate PRD:', err);
      setError('Failed to generate PRD. Please try again.');
      setIsGeneratingPRD(false);
    }
  };

  // Show loading overlay when generating PRD
  if (isGeneratingPRD) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-charcoal-800">
        <div className="text-center">
          <div className="mb-6">
            <svg className="animate-spin h-12 w-12 text-terracotta-500 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-cream-100 mb-2">Generating Your PRD</h2>
          <p className="text-charcoal-300 max-w-md">
            Creating a comprehensive Product Requirements Document based on our conversation...
          </p>
          <p className="text-charcoal-400 text-sm mt-4">This usually takes 15-30 seconds</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-charcoal-800 border-b border-charcoal-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={goToHome}
              className="text-charcoal-300 hover:text-cream-100 transition-colors no-drag"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-cream-100">{currentProject?.name}</h1>
              <p className="text-charcoal-300 text-sm">Discovery Phase - Let's refine your idea</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-charcoal-300">Step 1 of 4</span>
            <div className="flex space-x-1">
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-charcoal-600"></div>
              <div className="w-2 h-2 rounded-full bg-charcoal-600"></div>
              <div className="w-2 h-2 rounded-full bg-charcoal-600"></div>
            </div>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-rust-500/10 border-b border-rust-500/30 px-6 py-3">
          <div className="flex items-center text-rust-400">
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
          />
        </div>

        {/* Generate PRD button - shown when Claude signals readiness */}
        {readyForPRD && !isLoading && (
          <div className="border-t border-charcoal-500 p-6 bg-charcoal-800/50">
            <div className="flex flex-col items-center space-y-3">
              <p className="text-charcoal-300 text-sm">Claude has enough info to create your PRD</p>
              <button
                onClick={handleGeneratePRD}
                className="px-8 py-3 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 transition-colors font-semibold text-lg"
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
