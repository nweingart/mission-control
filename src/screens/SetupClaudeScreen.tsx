import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import InteractiveTerminal from '../components/InteractiveTerminal';

type CommandResult = 'success' | 'error' | null;

export default function SetupClaudeScreen() {
  const { cliStatus, initialize, setScreen } = useAppStore();
  const [isChecking, setIsChecking] = useState(false);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [sessionId, setSessionId] = useState<string>(`setup-${Date.now()}`);
  const [pendingCommand, setPendingCommand] = useState<{ command: string; label: string } | null>(null);
  const [commandResult, setCommandResult] = useState<CommandResult>(null);
  const sessionIdRef = useRef<string>(sessionId);

  const isInstalled = cliStatus?.claude.installed ?? false;
  const isAuthenticated = cliStatus?.claude.authenticated ?? false;
  const isReady = isInstalled && isAuthenticated;

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

        // Auto-recheck status after a brief delay
        setTimeout(async () => {
          setIsChecking(true);
          await initialize();
          setIsChecking(false);

          // Auto-close terminal on success
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
  }, [runningCommand, initialize]);

  const handleRecheck = async () => {
    setIsChecking(true);
    await initialize();
    setIsChecking(false);
  };

  const runCommand = (command: string, label: string) => {
    const newSessionId = `setup-${Date.now()}`;
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

  const handleContinue = () => {
    setScreen('setup-deploy');
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-surface-card border-b border-border px-6 py-4 drag-region header-with-traffic-lights">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-sans font-medium text-accent">Step 2 of 3</span>
            </div>
            <h1 className="text-xl font-sans font-bold text-ink mt-1">Set Up Claude Code</h1>
            <p className="text-ink-muted text-sm">
              Claude Code is the AI assistant that will build your project
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {isReady ? (
              <span className="inline-flex items-center px-3 py-1 text-sm font-medium bg-success/15 text-success">
                <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Ready
              </span>
            ) : (
              <span className="inline-flex items-center px-3 py-1 text-sm font-medium bg-accent/15 text-accent">
                Setup Required
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Claude Code Card */}
          <div className={`card-panel p-6 transition-all duration-300 ${
            isReady ? 'border-success/40 bg-success/10' : ''
          }`}>
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-12 h-12 bg-accent/15 flex items-center justify-center">
                <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-sans font-semibold text-ink">Claude Code</h2>
                <p className="text-ink-muted mt-1">
                  AI-powered coding assistant that writes, debugs, and improves your code
                </p>

                {/* Status badges */}
                <div className="flex items-center space-x-3 mt-3">
                  <span className={`inline-flex items-center px-2.5 py-1 text-sm font-medium ${
                    isInstalled ? 'bg-success/15 text-success' : 'bg-surface text-ink-secondary'
                  }`}>
                    {isInstalled ? (
                      <>
                        <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Installed
                      </>
                    ) : (
                      'Not installed'
                    )}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-1 text-sm font-medium ${
                    isAuthenticated ? 'bg-success/15 text-success' : 'bg-surface text-ink-secondary'
                  }`}>
                    {isAuthenticated ? (
                      <>
                        <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Authenticated
                      </>
                    ) : (
                      'Not authenticated'
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Setup steps */}
            {!isReady && (
              <div className="mt-6 space-y-4">
                {!isInstalled && (
                  <div className="bg-surface p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <span className="flex items-center justify-center w-6 h-6 bg-accent text-surface-light text-sm font-medium">1</span>
                        <p className="text-sm font-sans font-medium text-ink">Install Claude Code</p>
                      </div>
                      <button
                        onClick={() => runCommand('npm install -g @anthropic-ai/claude-code', 'install')}
                        disabled={runningCommand !== null}
                        className="btn-solid-primary px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed no-drag"
                      >
                        {runningCommand === 'install' ? (
                          <span className="flex items-center">
                            <div className="w-4 h-4 border-4 border-accent border-t-transparent animate-spin mr-2" />
                            Installing...
                          </span>
                        ) : (
                          'Run Install'
                        )}
                      </button>
                    </div>
                    <code className="block input-inset text-ink text-sm p-3 font-mono">
                      npm install -g @anthropic-ai/claude-code
                    </code>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        window.api.shell.openExternal('https://docs.anthropic.com/claude-code');
                      }}
                      className="text-sm text-accent hover:text-accent-hover mt-2 inline-block no-drag"
                    >
                      View documentation →
                    </a>
                  </div>
                )}

                {isInstalled && !isAuthenticated && (
                  <div className="bg-surface p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <span className="flex items-center justify-center w-6 h-6 bg-accent text-surface-light text-sm font-medium">
                          {isInstalled ? '1' : '2'}
                        </span>
                        <p className="text-sm font-sans font-medium text-ink">Authenticate with Claude</p>
                      </div>
                      <button
                        onClick={async () => {
                          await window.api.shell.openInTerminal('claude');
                        }}
                        className="btn-solid-primary px-4 py-2 text-sm no-drag"
                      >
                        Open in Terminal
                      </button>
                    </div>
                    <code className="block input-inset text-ink text-sm p-3 font-mono">
                      claude
                    </code>
                    <p className="text-sm text-ink-muted mt-2">
                      Opens Terminal.app with Claude Code. Complete the login, then click "Recheck Status" below.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Success state */}
            {isReady && (
              <div className="mt-6 p-4 bg-success/10 border border-success/30">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-success mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <p className="text-success font-medium">Claude Code is ready!</p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-8 flex justify-between items-center">
            <button
              onClick={handleRecheck}
              disabled={isChecking || runningCommand !== null}
              className="btn-solid flex items-center space-x-2 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed no-drag"
            >
              {isChecking ? (
                <>
                  <div className="w-4 h-4 border-4 border-accent border-t-transparent animate-spin" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Recheck Status</span>
                </>
              )}
            </button>

            <button
              onClick={handleContinue}
              disabled={!isReady}
              className="btn-solid-primary flex items-center space-x-2 px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed no-drag"
            >
              <span>Continue</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </main>

      {/* Terminal Modal */}
      {showTerminal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card-panel w-[640px] max-w-[90vw] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-sans font-semibold text-ink">Terminal</h3>
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
                    <div className="w-3 h-3 border-4 border-accent border-t-transparent animate-spin mr-1" />
                    Running...
                  </span>
                )}
              </div>
              <button onClick={handleCloseTerminal} className="text-ink-muted hover:text-ink-secondary no-drag">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <InteractiveTerminal
                sessionId={sessionId}
                onData={handleTerminalInput}
                onReady={handleTerminalReady}
                title="Setup"
                height="300px"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
