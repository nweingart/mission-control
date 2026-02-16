import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

export default function ToolDisconnectedOverlay() {
  const { cliStatus, setCLIStatus, setScreen } = useAppStore();
  const [isRechecking, setIsRechecking] = useState(false);

  if (!cliStatus) return null;

  const tools = [
    {
      name: 'Claude Code',
      installed: cliStatus.claude.installed,
      authenticated: cliStatus.claude.authenticated,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      name: 'GitHub CLI',
      installed: cliStatus.github.installed,
      authenticated: cliStatus.github.authenticated,
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      ),
    },
  ];

  const getStatus = (tool: typeof tools[number]) => {
    if (!tool.installed) return { label: 'Not installed', color: 'text-error' };
    if (!tool.authenticated) return { label: 'Not authenticated', color: 'text-spectrum-orange' };
    return { label: 'Connected', color: 'text-success' };
  };

  const isConnected = (tool: typeof tools[number]) => tool.installed && tool.authenticated;

  const handleRecheck = async () => {
    setIsRechecking(true);
    try {
      // Run all checks in parallel, including deep Claude check
      const [status, claudeDeep] = await Promise.all([
        window.api.cli.checkAll(),
        window.api.cli.checkClaudeDeep(),
      ]);
      // Override Claude with the deep check (actually invokes the CLI)
      setCLIStatus({ ...status, claude: claudeDeep });
    } catch (err) {
      console.error('CLI recheck failed:', err);
    } finally {
      setIsRechecking(false);
    }
  };

  const handleReconnect = () => {
    setScreen('onboarding');
  };

  return (
    <div className="absolute inset-0 z-50 bg-surface-light/80 backdrop-blur-sm flex items-center justify-center">
      <div className="card-panel p-8 max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-error/15 flex items-center justify-center">
            <svg className="w-5 h-5 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-sans font-semibold text-ink">Tools Disconnected</h2>
            <p className="text-sm text-ink-muted">Some required tools have lost connection</p>
          </div>
        </div>

        {/* Tool Status List */}
        <div className="space-y-3 mb-8">
          {tools.map((tool) => {
            const status = getStatus(tool);
            const connected = isConnected(tool);
            return (
              <div
                key={tool.name}
                className={`flex items-center justify-between px-4 py-3 border ${
                  connected
                    ? 'bg-surface/50 border-border'
                    : 'bg-error/5 border-error/20'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={connected ? 'text-success' : 'text-ink-muted'}>
                    {tool.icon}
                  </div>
                  <span className="text-sm font-medium text-ink">{tool.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  {connected ? (
                    <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex space-x-3">
          <button
            onClick={handleRecheck}
            disabled={isRechecking}
            className="btn-solid flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 disabled:opacity-50"
          >
            {isRechecking ? (
              <div className="w-4 h-4 border-2 border-ink-muted border-t-transparent animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            <span>{isRechecking ? 'Checking...' : 'Recheck'}</span>
          </button>
          <button
            onClick={handleReconnect}
            className="btn-solid-primary flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 font-medium"
          >
            <span>Reconnect</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
