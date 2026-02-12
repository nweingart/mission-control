import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import InteractiveTerminal from '../components/InteractiveTerminal';
import { SERVICE_REGISTRY, type ServiceKey } from '../constants/preflight-requirements';

const SERVICE_ICONS: Record<ServiceKey, React.ReactNode> = {
  claude: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  github: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  ),
  vercel: (
    <svg className="w-6 h-6" viewBox="0 0 76 65" fill="currentColor">
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  ),
  supabase: (
    <svg className="w-6 h-6" viewBox="0 0 109 113" fill="currentColor">
      <path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z" fillOpacity="0.7" />
      <path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z" />
      <path d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.041L54.4849 72.2922H9.83113C1.64038 72.2922 -2.92775 62.8321 2.1655 56.4175L45.317 2.07103Z" />
    </svg>
  ),
};

const INSTALL_URLS: Record<ServiceKey, string> = {
  claude: 'https://docs.anthropic.com/en/docs/claude-code',
  github: 'https://cli.github.com/',
  vercel: 'https://vercel.com/signup',
  supabase: 'https://supabase.com/docs/guides/cli',
};

interface CLIItem {
  name: string;
  key: ServiceKey;
  installUrl: string;
  installCommand: string;
  authCommand: string;
  description: string;
  icon: React.ReactNode;
}

const CLI_ITEMS: CLIItem[] = (Object.keys(SERVICE_REGISTRY) as ServiceKey[]).map((key) => ({
  key,
  name: SERVICE_REGISTRY[key].name,
  installUrl: INSTALL_URLS[key],
  installCommand: SERVICE_REGISTRY[key].installCommand,
  authCommand: SERVICE_REGISTRY[key].authCommand,
  description: SERVICE_REGISTRY[key].description,
  icon: SERVICE_ICONS[key],
}));

type CommandResult = 'success' | 'error' | null;

export default function SetupDeployScreen() {
  const { cliStatus, setCLIStatus, setScreen } = useAppStore();
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<'success' | 'partial' | null>(null);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [sessionId, setSessionId] = useState<string>(`setup-${Date.now()}`);
  const [pendingCommand, setPendingCommand] = useState<{ command: string; label: string } | null>(null);
  const [commandResult, setCommandResult] = useState<CommandResult>(null);
  const sessionIdRef = useRef<string>(sessionId);

  const claudeReady = cliStatus?.claude?.installed && cliStatus?.claude?.authenticated;
  const githubReady = cliStatus?.github?.installed && cliStatus?.github?.authenticated;
  const vercelReady = cliStatus?.vercel?.installed && cliStatus?.vercel?.authenticated;
  const supabaseReady = cliStatus?.supabase?.installed && cliStatus?.supabase?.authenticated;
  const allReady = claudeReady && githubReady && vercelReady && supabaseReady;
  const readyCount = [claudeReady, githubReady, vercelReady, supabaseReady].filter(Boolean).length;

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
          setIsChecking(true);
          try {
            const status = await window.api.cli.checkAll();
            setCLIStatus(status);
          } catch (err) {
            console.error('Failed to check CLI status:', err);
          }
          setIsChecking(false);

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

  const handleRecheck = async () => {
    setIsChecking(true);
    setLastCheckResult(null);
    try {
      const status = await window.api.cli.checkAll();
      setCLIStatus(status);

      // Determine if all services are ready
      const allReady = status.claude.installed && status.claude.authenticated &&
                       status.github.installed && status.github.authenticated &&
                       status.vercel.installed && status.vercel.authenticated &&
                       status.supabase.installed && status.supabase.authenticated;

      setLastCheckResult(allReady ? 'success' : 'partial');

      // Clear the result after 3 seconds
      setTimeout(() => setLastCheckResult(null), 3000);
    } catch (err) {
      console.error('Failed to check CLI status:', err);
    }
    setIsChecking(false);
  };

  const handleBack = () => {
    setScreen('home');
  };

  const runCommand = (command: string, label: string) => {
    const newSessionId = `setup-${Date.now()}`;
    sessionIdRef.current = newSessionId;
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
    setScreen('setup-ready');
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-surface-card border-b border-border px-6 py-4 drag-region header-with-traffic-lights">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-sans font-medium text-accent">Step 2 of 2</span>
            </div>
            <h1 className="text-xl font-sans font-bold text-ink mt-1">Set Up Tools</h1>
            <p className="text-ink-muted text-sm">
              Configure Claude Code, GitHub, Vercel, and Supabase
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs font-sans font-medium text-ink-muted">{readyCount}/4 ready</span>
            <div className="w-20 h-2 bg-border overflow-hidden">
              <div
                className="h-full bg-success transition-all duration-300"
                style={{ width: `${(readyCount / 4) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {CLI_ITEMS.map((cli) => {
            const status = cliStatus?.[cli.key];
            const isInstalled = status?.installed ?? false;
            const isAuthenticated = status?.authenticated ?? false;
            const isReady = isInstalled && isAuthenticated;
            const isInstallingThis = runningCommand === `install-${cli.key}`;
            const isAuthingThis = runningCommand === `auth-${cli.key}`;

            return (
              <div
                key={cli.key}
                className={`card-panel p-5 transition-all duration-300 ${
                  isReady ? 'border-success/40 bg-success/10' : ''
                }`}
              >
                <div className="flex items-start space-x-4">
                  <div className={`flex-shrink-0 w-10 h-10 flex items-center justify-center ${
                    isReady ? 'bg-success/15 text-success' : 'bg-border text-ink-secondary'
                  }`}>
                    {cli.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-sans font-semibold text-ink">{cli.name}</h3>
                      {isReady && (
                        <span className="inline-flex items-center text-success text-sm font-medium">
                          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Ready
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink-muted mt-0.5">{cli.description}</p>

                    {/* Status badges - always show */}
                    <div className="flex items-center space-x-3 mt-2">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${
                        isInstalled ? 'bg-success/15 text-success' : 'bg-surface text-ink-secondary'
                      }`}>
                        {isInstalled ? (
                          <>
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Installed
                          </>
                        ) : (
                          'Not installed'
                        )}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${
                        isAuthenticated ? 'bg-success/15 text-success' : 'bg-surface text-ink-secondary'
                      }`}>
                        {isAuthenticated ? (
                          <>
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
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
                  <div className="mt-4 ml-14 space-y-3">
                    {!isInstalled && (
                      <div className="bg-surface p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-sans font-medium text-ink">Install {cli.name}</p>
                          <button
                            onClick={() => runCommand(cli.installCommand, `install-${cli.key}`)}
                            disabled={runningCommand !== null}
                            className="btn-solid-primary px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed no-drag"
                          >
                            {isInstallingThis ? (
                              <span className="flex items-center">
                                <div className="w-4 h-4 border-4 border-accent border-t-transparent animate-spin mr-1.5" />
                                Installing...
                              </span>
                            ) : (
                              'Run Install'
                            )}
                          </button>
                        </div>
                        <code className="block input-inset text-ink text-sm p-2 font-mono">
                          {cli.installCommand}
                        </code>
                      </div>
                    )}

                    {isInstalled && !isAuthenticated && (
                      <div className="bg-surface p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-sans font-medium text-ink">Authenticate {cli.name}</p>
                          <button
                            onClick={() => runCommand(cli.authCommand, `auth-${cli.key}`)}
                            disabled={runningCommand !== null}
                            className="btn-solid-primary px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed no-drag"
                          >
                            {isAuthingThis ? (
                              <span className="flex items-center">
                                <div className="w-4 h-4 border-4 border-accent border-t-transparent animate-spin mr-1.5" />
                                Authenticating...
                              </span>
                            ) : (
                              `Login to ${cli.name}`
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-ink-muted">
                          Opens your browser to sign in.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* All ready message */}
          {allReady && (
            <div className="mt-6 p-4 bg-success/10 border border-success/30">
              <div className="flex items-center justify-center">
                <svg className="w-6 h-6 text-success mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-success font-medium">All deployment tools are ready!</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="max-w-2xl mx-auto mt-8 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleBack}
              className="btn-solid flex items-center space-x-2 px-4 py-2 no-drag"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back</span>
            </button>
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
                  <span>Recheck</span>
                </>
              )}
            </button>

            {/* Recheck feedback */}
            {lastCheckResult === 'success' && (
              <span className="flex items-center text-success text-sm font-medium animate-fade-in">
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                All services verified!
              </span>
            )}
            {lastCheckResult === 'partial' && (
              <span className="flex items-center text-accent-hover text-sm font-medium animate-fade-in">
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Some services need setup
              </span>
            )}
          </div>

          <button
            onClick={handleContinue}
            disabled={!allReady}
            className="btn-solid-primary flex items-center space-x-2 px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed no-drag"
          >
            <span>Start Building</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
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
