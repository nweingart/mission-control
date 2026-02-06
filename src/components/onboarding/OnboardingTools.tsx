import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import InteractiveTerminal from '../InteractiveTerminal';
import type { CLIStatus } from '../../types';

interface OnboardingToolsProps {
  onNext: () => void;
  onBack: () => void;
}

interface CLIItem {
  name: string;
  key: 'claude' | 'github' | 'vercel' | 'supabase';
  installCommand: string;
  authCommand: string;
  description: string;
  icon: React.ReactNode;
}

const CLI_ITEMS: CLIItem[] = [
  {
    name: 'Claude Code',
    key: 'claude',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    authCommand: 'claude',
    description: 'AI coding assistant that builds your project',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    name: 'GitHub CLI',
    key: 'github',
    installCommand: 'brew install gh',
    authCommand: 'gh auth login',
    description: 'Push code and enable auto-deployments',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
    ),
  },
  {
    name: 'Vercel',
    key: 'vercel',
    installCommand: 'npm install -g vercel',
    authCommand: 'vercel login',
    description: 'Deploy automatically from GitHub',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 76 65" fill="currentColor">
        <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
      </svg>
    ),
  },
  {
    name: 'Supabase CLI',
    key: 'supabase',
    installCommand: 'brew install supabase/tap/supabase',
    authCommand: 'supabase login',
    description: 'Database and backend services',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 109 113" fill="currentColor">
        <path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z" fillOpacity="0.7" />
        <path d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.041L54.4849 72.2922H9.83113C1.64038 72.2922 -2.92775 62.8321 2.1655 56.4175L45.317 2.07103Z" />
      </svg>
    ),
  },
];

type CommandResult = 'success' | 'error' | null;

export default function OnboardingTools({ onNext, onBack }: OnboardingToolsProps) {
  const { cliStatus, setCLIStatus } = useAppStore();
  const [isChecking, setIsChecking] = useState(false);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [sessionId, setSessionId] = useState<string>(`onboarding-${Date.now()}`);
  const [pendingCommand, setPendingCommand] = useState<{ command: string; label: string } | null>(null);
  const [commandResult, setCommandResult] = useState<CommandResult>(null);
  const [tokenValue, setTokenValue] = useState('');
  const [vercelTokenValue, setVercelTokenValue] = useState('');
  const [lastCheckResult, setLastCheckResult] = useState<'success' | 'partial' | null>(null);
  const sessionIdRef = useRef<string>(sessionId);

  const claudeReady = cliStatus?.claude.installed && cliStatus?.claude.authenticated;
  const githubReady = cliStatus?.github.installed && cliStatus?.github.authenticated;
  const vercelReady = cliStatus?.vercel.installed && cliStatus?.vercel.authenticated;
  const supabaseReady = cliStatus?.supabase.installed && cliStatus?.supabase.authenticated;
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

  // Poll auth status while the Claude auth command is running.
  // The `claude` command opens an interactive REPL that never exits on its own,
  // so we poll and auto-kill the session once auth is detected.
  useEffect(() => {
    if (runningCommand !== 'auth-claude') return;

    const interval = setInterval(async () => {
      try {
        const status = await window.api.cli.checkClaude();
        if (status.authenticated) {
          clearInterval(interval);
          // Auth detected — kill the REPL session
          window.api.setup.killSession(sessionIdRef.current);
          setRunningCommand(null);
          setCommandResult('success');

          // Full recheck to update all statuses
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

  const handleRecheck = async () => {
    setIsChecking(true);
    setLastCheckResult(null);
    try {
      const status = await window.api.cli.checkAll();
      setCLIStatus(status);

      const allOk = status.claude.installed && status.claude.authenticated &&
                    status.github.installed && status.github.authenticated &&
                    status.vercel.installed && status.vercel.authenticated &&
                    status.supabase.installed && status.supabase.authenticated;

      setLastCheckResult(allOk ? 'success' : 'partial');
      setTimeout(() => setLastCheckResult(null), 3000);
    } catch (err) {
      console.error('Failed to check CLI status:', err);
    }
    setIsChecking(false);
  };

  const runCommand = (command: string, label: string) => {
    const newSessionId = `onboarding-${Date.now()}`;
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

  return (
    <div className="max-w-2xl w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-cream-100 mb-1">Connect Your Tools</h2>
        <p className="text-charcoal-300">
          <span className="text-sage-400 font-medium">{readyCount}/4</span> connected
        </p>
      </div>

      {/* Tool cards */}
      <div className="space-y-3 mb-4">
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
              className={`bg-charcoal-700 rounded-lg border-2 p-4 transition-all duration-300 ${
                isReady ? 'border-sage-500/40 bg-sage-500/10' : 'border-charcoal-600'
              }`}
            >
              <div className="flex items-start space-x-3">
                <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                  isReady ? 'bg-sage-500/15 text-sage-500' : 'bg-charcoal-600 text-charcoal-200'
                }`}>
                  {cli.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-cream-100">{cli.name}</h3>
                    {isReady && (
                      <span className="inline-flex items-center text-sage-500 text-sm font-medium">
                        <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-charcoal-300 mt-0.5">{cli.description}</p>

                  {/* Status badges */}
                  {!isReady && (
                    <div className="flex items-center space-x-3 mt-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        isInstalled ? 'bg-sage-500/15 text-sage-400' : 'bg-charcoal-700 text-charcoal-200'
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        isAuthenticated ? 'bg-sage-500/15 text-sage-400' : 'bg-charcoal-700 text-charcoal-200'
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
                  )}
                </div>
              </div>

              {/* Setup steps */}
              {!isReady && (
                <div className="mt-3 ml-13 space-y-3">
                  {!isInstalled && (
                    <div className="bg-charcoal-700 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-charcoal-100">Install {cli.name}</p>
                        <button
                          onClick={() => runCommand(cli.installCommand, `install-${cli.key}`)}
                          disabled={runningCommand !== null}
                          className="px-3 py-1.5 text-sm bg-terracotta-500 text-charcoal-950 rounded hover:bg-terracotta-600 disabled:bg-charcoal-600 disabled:cursor-not-allowed transition-colors"
                        >
                          {isInstallingThis ? (
                            <span className="flex items-center">
                              <svg className="animate-spin h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24">
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
                      <code className="block bg-charcoal-950 text-charcoal-100 text-sm p-2 rounded font-mono">
                        {cli.installCommand}
                      </code>
                    </div>
                  )}

                  {isInstalled && !isAuthenticated && (
                    <div className="bg-charcoal-700 rounded-lg p-3">
                      {cli.key === 'claude' ? (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-charcoal-100">Authenticate Claude Code</p>
                            <button
                              onClick={() => runCommand('claude', `auth-${cli.key}`)}
                              disabled={runningCommand !== null}
                              className="px-3 py-1.5 text-sm bg-terracotta-500 text-charcoal-950 rounded hover:bg-terracotta-600 disabled:bg-charcoal-600 disabled:cursor-not-allowed transition-colors"
                            >
                              {isAuthingThis ? (
                                <span className="flex items-center">
                                  <svg className="animate-spin h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  Authenticating...
                                </span>
                              ) : (
                                'Login to Claude'
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-charcoal-300">
                            This will open your browser to sign in with your Anthropic account.
                          </p>
                        </>
                      ) : cli.key === 'github' ? (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-charcoal-100">Authenticate with GitHub</p>
                            <button
                              onClick={() => runCommand('gh auth login --web', `auth-${cli.key}`)}
                              disabled={runningCommand !== null}
                              className="px-3 py-1.5 text-sm bg-terracotta-500 text-charcoal-950 rounded hover:bg-terracotta-600 disabled:bg-charcoal-600 disabled:cursor-not-allowed transition-colors"
                            >
                              {isAuthingThis ? (
                                <span className="flex items-center">
                                  <svg className="animate-spin h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  Authenticating...
                                </span>
                              ) : (
                                'Login with GitHub'
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-charcoal-300">
                            This will open GitHub in your browser to authorize access.
                          </p>
                        </>
                      ) : cli.key === 'supabase' ? (
                        <>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium text-charcoal-100">Authenticate with Token</p>
                            <button
                              onClick={() => window.api.shell.openExternal('https://supabase.com/dashboard/account/tokens')}
                              className="px-3 py-1.5 text-sm border border-terracotta-500 text-terracotta-500 rounded hover:bg-terracotta-500/10 transition-colors"
                            >
                              Get Token
                            </button>
                          </div>
                          <div className="flex space-x-2">
                            <input
                              type="text"
                              value={tokenValue}
                              onChange={(e) => setTokenValue(e.target.value)}
                              placeholder="Paste your Supabase access token"
                              className="flex-1 px-3 py-2 text-sm border border-charcoal-500 rounded focus:outline-none focus:ring-2 focus:ring-terracotta-500 focus:border-transparent bg-charcoal-700 text-cream-100 placeholder:text-charcoal-400"
                            />
                            <button
                              onClick={() => {
                                if (tokenValue.trim()) {
                                  runCommand(`supabase login --token ${tokenValue.trim()}`, 'auth-supabase');
                                  setTokenValue('');
                                }
                              }}
                              disabled={!tokenValue.trim() || runningCommand !== null}
                              className="px-4 py-2 text-sm bg-terracotta-500 text-charcoal-950 rounded hover:bg-terracotta-600 disabled:bg-charcoal-600 disabled:cursor-not-allowed transition-colors"
                            >
                              {isAuthingThis ? (
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              ) : (
                                'Login'
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-charcoal-300 mt-2">
                            Click "Get Token" to create an access token, then paste it above.
                          </p>
                        </>
                      ) : (
                        // Vercel: Token-based auth
                        <>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium text-charcoal-100">Authenticate with Token</p>
                            <button
                              onClick={() => window.api.shell.openExternal('https://vercel.com/account/tokens')}
                              className="px-3 py-1.5 text-sm border border-terracotta-500 text-terracotta-500 rounded hover:bg-terracotta-500/10 transition-colors"
                            >
                              Get Token
                            </button>
                          </div>
                          <div className="flex space-x-2">
                            <input
                              type="text"
                              value={vercelTokenValue}
                              onChange={(e) => setVercelTokenValue(e.target.value)}
                              placeholder="Paste your Vercel access token"
                              className="flex-1 px-3 py-2 text-sm border border-charcoal-500 rounded focus:outline-none focus:ring-2 focus:ring-terracotta-500 focus:border-transparent bg-charcoal-700 text-cream-100 placeholder:text-charcoal-400"
                            />
                            <button
                              onClick={async () => {
                                if (vercelTokenValue.trim()) {
                                  setRunningCommand('auth-vercel');
                                  try {
                                    await window.api.cli.saveVercelToken(vercelTokenValue.trim());
                                    setVercelTokenValue('');
                                    setIsChecking(true);
                                    try {
                                      const status = await window.api.cli.checkAll();
                                      setCLIStatus(status);
                                    } catch (err) {
                                      console.error('Failed to check CLI status:', err);
                                    }
                                    setIsChecking(false);
                                  } catch (err) {
                                    console.error('Failed to save Vercel token:', err);
                                  } finally {
                                    setRunningCommand(null);
                                  }
                                }
                              }}
                              disabled={!vercelTokenValue.trim() || runningCommand !== null}
                              className="px-4 py-2 text-sm bg-terracotta-500 text-charcoal-950 rounded hover:bg-terracotta-600 disabled:bg-charcoal-600 disabled:cursor-not-allowed transition-colors"
                            >
                              {isAuthingThis ? (
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              ) : (
                                'Save Token'
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-charcoal-300 mt-2">
                            Click "Get Token" to create an access token, then paste it above.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Terminal */}
      {showTerminal && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
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
            <button onClick={handleCloseTerminal} className="text-charcoal-400 hover:text-charcoal-200">
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

      {/* Navigation */}
      <div className="flex justify-between items-center mt-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 px-4 py-2 text-charcoal-300 hover:text-cream-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back</span>
          </button>
          <button
            onClick={handleRecheck}
            disabled={isChecking || runningCommand !== null}
            className="flex items-center space-x-2 px-4 py-2 text-charcoal-300 hover:text-cream-100 disabled:text-charcoal-400 transition-colors"
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
                <span>Recheck</span>
              </>
            )}
          </button>

          {/* Recheck feedback */}
          {lastCheckResult === 'success' && (
            <span className="flex items-center text-sage-500 text-sm font-medium">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              All tools verified!
            </span>
          )}
          {lastCheckResult === 'partial' && (
            <span className="flex items-center text-terracotta-600 text-sm font-medium">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Some tools need setup
            </span>
          )}
        </div>

        <button
          onClick={onNext}
          disabled={!allReady}
          className="flex items-center space-x-2 px-6 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 disabled:bg-charcoal-600 disabled:cursor-not-allowed transition-colors font-medium"
        >
          <span>Continue</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
