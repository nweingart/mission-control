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
      <header className="bg-charcoal-800 border-b border-charcoal-600 px-6 py-4 drag-region header-with-traffic-lights">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-terracotta-500 font-medium">Step 2 of 3</span>
            </div>
            <h1 className="text-2xl font-bold text-cream-100 mt-1">Set Up Claude Code</h1>
            <p className="text-charcoal-300 text-sm">
              Claude Code is the AI assistant that will build your project
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {isReady ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-sage-500/15 text-sage-400">
                <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Ready
              </span>
            ) : (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-terracotta-500/15 text-terracotta-400">
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
          <div className={`bg-charcoal-700 rounded-lg border-2 p-6 transition-all duration-300 ${
            isReady ? 'border-sage-500/40 bg-sage-500/10' : 'border-charcoal-600'
          }`}>
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-12 h-12 bg-terracotta-500/15 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-terracotta-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-cream-100">Claude Code</h2>
                <p className="text-charcoal-300 mt-1">
                  AI-powered coding assistant that writes, debugs, and improves your code
                </p>

                {/* Status badges */}
                <div className="flex items-center space-x-3 mt-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded text-sm font-medium ${
                    isInstalled ? 'bg-sage-500/15 text-sage-400' : 'bg-charcoal-700 text-charcoal-200'
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
                  <span className={`inline-flex items-center px-2.5 py-1 rounded text-sm font-medium ${
                    isAuthenticated ? 'bg-sage-500/15 text-sage-400' : 'bg-charcoal-700 text-charcoal-200'
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
                  <div className="bg-charcoal-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-terracotta-500 text-charcoal-950 text-sm font-medium">1</span>
                        <p className="font-medium text-charcoal-100">Install Claude Code</p>
                      </div>
                      <button
                        onClick={() => runCommand('npm install -g @anthropic-ai/claude-code', 'install')}
                        disabled={runningCommand !== null}
                        className="px-4 py-2 text-sm bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 disabled:bg-charcoal-600 disabled:cursor-not-allowed transition-colors no-drag"
                      >
                        {runningCommand === 'install' ? (
                          <span className="flex items-center">
                            <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Installing...
                          </span>
                        ) : (
                          'Run Install'
                        )}
                      </button>
                    </div>
                    <code className="block bg-charcoal-950 text-charcoal-100 text-sm p-3 rounded-lg font-mono">
                      npm install -g @anthropic-ai/claude-code
                    </code>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        window.api.shell.openExternal('https://docs.anthropic.com/claude-code');
                      }}
                      className="text-sm text-terracotta-500 hover:text-terracotta-600 mt-2 inline-block no-drag"
                    >
                      View documentation →
                    </a>
                  </div>
                )}

                {isInstalled && !isAuthenticated && (
                  <div className="bg-charcoal-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-terracotta-500 text-charcoal-950 text-sm font-medium">
                          {isInstalled ? '1' : '2'}
                        </span>
                        <p className="font-medium text-charcoal-100">Authenticate with Claude</p>
                      </div>
                      <button
                        onClick={async () => {
                          await window.api.shell.openInTerminal('claude');
                        }}
                        className="px-4 py-2 text-sm bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 transition-colors no-drag"
                      >
                        Open in Terminal
                      </button>
                    </div>
                    <code className="block bg-charcoal-950 text-charcoal-100 text-sm p-3 rounded-lg font-mono">
                      claude
                    </code>
                    <p className="text-sm text-charcoal-300 mt-2">
                      Opens Terminal.app with Claude Code. Complete the login, then click "Recheck Status" below.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Success state */}
            {isReady && (
              <div className="mt-6 p-4 bg-sage-500/10 rounded-lg border border-sage-500/30">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-sage-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sage-400 font-medium">Claude Code is ready!</p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-8 flex justify-between items-center">
            <button
              onClick={handleRecheck}
              disabled={isChecking || runningCommand !== null}
              className="flex items-center space-x-2 px-4 py-2 text-charcoal-300 hover:text-cream-100 disabled:text-charcoal-400 transition-colors no-drag"
            >
              {isChecking ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
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
              className="flex items-center space-x-2 px-6 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 disabled:bg-charcoal-600 disabled:cursor-not-allowed transition-colors no-drag"
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
          <div className="bg-charcoal-800 border border-charcoal-600 rounded-xl shadow-2xl w-[640px] max-w-[90vw] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-charcoal-600">
              <div className="flex items-center space-x-2">
                <h3 className="font-medium text-charcoal-100">Terminal</h3>
                {commandResult === 'success' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sage-500/15 text-sage-400">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Complete!
                  </span>
                )}
                {commandResult === 'error' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rust-500/15 text-rust-400">
                    Failed - check output
                  </span>
                )}
                {runningCommand && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-terracotta-500/15 text-terracotta-400">
                    <svg className="animate-spin h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Running...
                  </span>
                )}
              </div>
              <button onClick={handleCloseTerminal} className="text-charcoal-400 hover:text-charcoal-200 no-drag">
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
