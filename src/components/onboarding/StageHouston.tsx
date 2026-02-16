import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import InteractiveTerminal from '../InteractiveTerminal';
import houstonAvatar from '../../assets/houston-avatar.webp';

interface StageHoustonProps {
  onComplete: () => void;
}

type CommandResult = 'success' | 'error' | null;

interface MiniChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function StageHouston({ onComplete }: StageHoustonProps) {
  const { cliStatus, setCLIStatus, completeOnboardingStage } = useAppStore();
  const [runningCommand, setRunningCommand] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [sessionId, setSessionId] = useState<string>(`houston-${Date.now()}`);
  const [pendingCommand, setPendingCommand] = useState<{ command: string; label: string } | null>(null);
  const [commandResult, setCommandResult] = useState<CommandResult>(null);
  const [isChecking, setIsChecking] = useState(false);
  const sessionIdRef = useRef<string>(sessionId);

  // Ask Houston mini-chat state
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<MiniChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const claudeInstalled = cliStatus?.claude.installed ?? false;
  const claudeAuthenticated = cliStatus?.claude.authenticated ?? false;
  const githubInstalled = cliStatus?.github.installed ?? false;
  const githubAuthenticated = cliStatus?.github.authenticated ?? false;
  const allReady = claudeInstalled && claudeAuthenticated && githubInstalled && githubAuthenticated;
  const readyCount = [claudeInstalled, claudeAuthenticated, githubInstalled, githubAuthenticated].filter(Boolean).length;

  // Keep ref in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Set up exit listener
  useEffect(() => {
    const handleExit = (data: { sessionId: string; code: number }) => {
      if (data.sessionId === sessionIdRef.current) {
        const success = data.code === 0;
        setCommandResult(success ? 'success' : 'error');
        setRunningCommand(null);

        setTimeout(async () => {
          try {
            const status = await window.api.cli.checkAll();
            setCLIStatus(status);
          } catch (err) {
            console.error('Failed to check CLI status:', err);
          }

          if (success) {
            setTimeout(() => {
              setShowTerminal(false);
              setCommandResult(null);
            }, 1500);
          }
        }, 500);
      }
    };

    window.api.setup.onExit(handleExit);
    return () => {
      window.api.setup.removeListeners();
    };
  }, [runningCommand, setCLIStatus]);

  // Poll auth status while Claude auth command is running
  useEffect(() => {
    if (runningCommand !== 'auth-claude') return;

    const interval = setInterval(async () => {
      try {
        const status = await window.api.cli.checkClaude();
        if (status.authenticated) {
          clearInterval(interval);
          window.api.setup.killSession(sessionIdRef.current);
          setRunningCommand(null);
          setCommandResult('success');

          const fullStatus = await window.api.cli.checkAll();
          setCLIStatus(fullStatus);

          setTimeout(() => {
            setShowTerminal(false);
            setCommandResult(null);
          }, 1500);
        }
      } catch (err) {
        console.error('Claude auth poll failed:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [runningCommand, setCLIStatus]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Auto-advance when ALL tools are ready
  useEffect(() => {
    if (allReady) {
      completeOnboardingStage(1);
    }
  }, [allReady, completeOnboardingStage]);

  const runCommand = (command: string, label: string) => {
    const newSessionId = `houston-${Date.now()}`;
    setSessionId(newSessionId);
    setPendingCommand({ command, label });
    setShowTerminal(true);
    setRunningCommand(label);
    setCommandResult(null);
  };

  const handleTerminalReady = useCallback(async () => {
    if (pendingCommand) {
      try {
        await window.api.setup.runCommand(pendingCommand.command, sessionIdRef.current);
      } catch (err) {
        console.error('Command failed:', err);
        setCommandResult('error');
        setRunningCommand(null);
      }
      setPendingCommand(null);
    }
  }, [pendingCommand]);

  const handleTerminalInput = useCallback((data: string) => {
    window.api.setup.sendInput(sessionIdRef.current, data);
  }, []);

  const handleCloseTerminal = () => {
    if (runningCommand) {
      window.api.setup.killSession(sessionId);
      setRunningCommand(null);
    }
    setShowTerminal(false);
    setCommandResult(null);
  };

  const handleRecheck = async () => {
    setIsChecking(true);
    try {
      const status = await window.api.cli.checkAll();
      setCLIStatus(status);
    } catch (err) {
      console.error('Failed to check CLI status:', err);
    }
    setIsChecking(false);
  };

  // Ask Houston mini-chat handler
  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: MiniChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: chatInput.trim(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      let cwd = '/tmp';
      try {
        const config = await window.api.storage.getConfig();
        if (config.developmentPath) {
          cwd = config.developmentPath;
        }
      } catch { /* use /tmp fallback */ }
      const prompt = `You are Houston, a friendly setup assistant. The user is setting up development tools (Claude Code and GitHub CLI) on their Mac. Help them troubleshoot setup issues. Be concise and practical.\n\nUser: ${userMsg.content}`;
      const response = await window.api.claude.chat(cwd, prompt);
      setChatMessages((prev) => [
        ...prev,
        { id: `asst-${Date.now()}`, role: 'assistant', content: response },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'assistant', content: `Sorry, I couldn't connect. Try again in a moment.` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const claudeReady = claudeInstalled && claudeAuthenticated;

  // Checklist items
  const items = [
    {
      label: 'Install Claude Code',
      description: 'The AI that powers Houston',
      done: claudeInstalled,
      actionLabel: 'RUN INSTALL',
      runningLabel: 'INSTALLING...',
      commandKey: 'install-claude',
      command: 'npm install -g @anthropic-ai/claude-code',
      codeSnippet: 'npm install -g @anthropic-ai/claude-code',
      enabled: true,
    },
    {
      label: 'Authenticate Claude',
      description: 'Sign in with your Anthropic account',
      done: claudeAuthenticated,
      actionLabel: 'LOGIN TO CLAUDE',
      runningLabel: 'AUTHENTICATING...',
      commandKey: 'auth-claude',
      command: 'claude',
      codeSnippet: null,
      enabled: claudeInstalled,
    },
    {
      label: 'Install GitHub CLI',
      description: 'Push code and enable auto-deployments',
      done: githubInstalled,
      actionLabel: 'RUN INSTALL',
      runningLabel: 'INSTALLING...',
      commandKey: 'install-github',
      command: 'brew install gh',
      codeSnippet: 'brew install gh',
      enabled: claudeReady,
    },
    {
      label: 'Authenticate GitHub',
      description: 'Connect your GitHub account',
      done: githubAuthenticated,
      actionLabel: 'LOGIN WITH GITHUB',
      runningLabel: 'AUTHENTICATING...',
      commandKey: 'auth-github',
      command: 'gh auth login --web',
      codeSnippet: null,
      enabled: claudeReady && githubInstalled,
    },
  ];

  return (
    <div className="max-w-xl w-full">
      {/* Houston avatar + message */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-border mb-4 grayscale brightness-75">
          <img src={houstonAvatar} alt="Houston" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
        </div>
        <div className="card-panel p-4 max-w-md text-center">
          <p className="text-sm text-ink leading-relaxed">
            I'm Houston — I'll help you build and ship your app. Let's get everything set up.
          </p>
        </div>
      </div>

      {/* Connected counter */}
      <div className="text-center mb-4">
        <p className="text-ink-muted text-sm">
          <span className="text-success font-medium">{readyCount}/4</span> connected
        </p>
      </div>

      {/* Checklist */}
      <div className="space-y-3">
        {items.map((item, idx) => {
          const isRunning = runningCommand === item.commandKey;
          const dimmed = !item.enabled && !item.done;

          return (
            <div
              key={item.commandKey}
              className={`bg-surface border-2 p-4 transition-all duration-300 ${
                item.done ? 'border-success/40 bg-success/10' : dimmed ? 'border-border opacity-50' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 flex items-center justify-center text-sm font-display ${
                    item.done ? 'bg-success/15 text-success' : 'bg-surface-card text-ink-secondary border border-border'
                  }`}>
                    {item.done ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-sans font-medium text-ink">{item.label}</h3>
                    <p className="text-xs text-ink-muted">{item.description}</p>
                  </div>
                </div>
                {item.done ? (
                  <span className="text-success text-sm font-medium">Done</span>
                ) : item.enabled ? (
                  <button
                    onClick={() => runCommand(item.command, item.commandKey)}
                    disabled={runningCommand !== null}
                    className="btn-solid-primary text-[13px] px-3 py-1.5"
                  >
                    {isRunning ? (
                      <span className="flex items-center">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin mr-1.5" />
                        {item.runningLabel}
                      </span>
                    ) : (
                      item.actionLabel
                    )}
                  </button>
                ) : null}
              </div>
              {!item.done && item.enabled && item.codeSnippet && (
                <code className="block bg-surface-light text-ink text-sm p-2 font-mono border border-border mt-3">
                  {item.codeSnippet}
                </code>
              )}
            </div>
          );
        })}
      </div>

      {/* Terminal */}
      {showTerminal && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-sans font-medium text-ink">Terminal</h3>
              {commandResult === 'success' && (
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-success/15 text-success">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Complete!
                </span>
              )}
              {commandResult === 'error' && (
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-error/15 text-error">
                  Failed - check output
                </span>
              )}
              {runningCommand && (
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-accent/15 text-accent">
                  <div className="w-3 h-3 border-2 border-accent border-t-transparent animate-spin mr-1" />
                  Running...
                </span>
              )}
            </div>
            <button onClick={handleCloseTerminal} className="text-ink-muted hover:text-ink-secondary">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <InteractiveTerminal
            sessionId={sessionId}
            onData={handleTerminalInput}
            onReady={handleTerminalReady}
            title="Setup"
            height="200px"
          />
        </div>
      )}

      {/* Navigation row: Ask Houston + Recheck on left, Continue on right */}
      <div className="flex justify-between items-center mt-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowChat((prev) => !prev)}
            className="btn-solid flex items-center space-x-2 text-sm"
          >
            <div className="w-5 h-5 rounded-full overflow-hidden border-2 border-spectrum-blue">
              <img src={houstonAvatar} alt="Houston" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
            </div>
            <span>{showChat ? 'CLOSE CHAT' : 'ASK HOUSTON'}</span>
          </button>
          <button
            onClick={handleRecheck}
            disabled={isChecking || runningCommand !== null}
            className="btn-solid flex items-center space-x-2"
          >
            {isChecking ? (
              <>
                <div className="w-4 h-4 border-2 border-ink border-t-transparent animate-spin" />
                <span>CHECKING...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>RECHECK</span>
              </>
            )}
          </button>
        </div>

        {allReady && (
          <button
            onClick={onComplete}
            className="btn-solid-primary flex items-center space-x-2"
          >
            <span>CONTINUE</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Ask Houston mini-chat */}
      {showChat && (
        <div className="mt-4 card-panel overflow-hidden">
          <div className="p-3 border-b border-border flex items-center space-x-2">
            <div className="w-6 h-6 rounded-full overflow-hidden border-2 border-spectrum-blue">
              <img src={houstonAvatar} alt="Houston" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
            </div>
            <span className="text-sm font-sans font-medium text-ink">Ask Houston</span>
            <span className="text-xs text-ink-muted">Setup help</span>
          </div>
          <div className="h-48 overflow-y-auto p-3 space-y-2">
            {chatMessages.length === 0 && (
              <p className="text-xs text-ink-muted text-center mt-4">
                Ask me anything about setting up these tools.
              </p>
            )}
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-accent/15 text-accent'
                    : 'bg-surface text-ink border border-border'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-surface text-ink-muted text-sm px-3 py-2 border border-border">
                  <div className="flex items-center space-x-1.5">
                    <div className="w-1.5 h-1.5 bg-ink-muted/30 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-ink-muted/30 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-ink-muted/30 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-border flex space-x-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
              placeholder="Ask about setup issues..."
              className="input-inset flex-1 text-sm"
              disabled={chatLoading}
            />
            <button
              onClick={handleChatSend}
              disabled={!chatInput.trim() || chatLoading}
              className="btn-solid-primary text-[13px] px-3 py-1.5"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
