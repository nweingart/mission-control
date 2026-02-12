import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import InteractiveTerminal from './InteractiveTerminal';
import { SERVICE_REGISTRY, type ServiceKey } from '../constants/preflight-requirements';
import type { PreflightFailure } from '../hooks/usePreflightCheck';

interface PreflightGateOverlayProps {
  failures: PreflightFailure[];
  onRetry: () => void;
  onDismiss?: () => void;
  context: string;
}

export default function PreflightGateOverlay({
  failures,
  onRetry,
  onDismiss,
  context,
}: PreflightGateOverlayProps) {
  const { setCLIStatus } = useAppStore();
  const [showTerminal, setShowTerminal] = useState(false);
  const [sessionId, setSessionId] = useState(`preflight-${Date.now()}`);
  const [runningService, setRunningService] = useState<ServiceKey | null>(null);
  const [commandResult, setCommandResult] = useState<'success' | 'error' | null>(null);
  const [isRechecking, setIsRechecking] = useState(false);
  const sessionIdRef = useRef(sessionId);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Listen for terminal command exits
  useEffect(() => {
    const handleExit = (data: { sessionId: string; code: number }) => {
      if (data.sessionId === sessionIdRef.current) {
        const success = data.code === 0;
        setCommandResult(success ? 'success' : 'error');
        setRunningService(null);

        // Auto-recheck after command completes
        setTimeout(async () => {
          setIsRechecking(true);
          try {
            const status = await window.api.cli.checkAll();
            setCLIStatus(status);

            // Check if all failures are now resolved
            const stillFailing = failures.some((f) => {
              const svc = status[f.key];
              return !svc?.installed || !svc?.authenticated;
            });

            if (!stillFailing) {
              // All fixed — close terminal and auto-retry
              setTimeout(() => {
                setShowTerminal(false);
                setCommandResult(null);
                onRetry();
              }, 1000);
            }
          } catch (err) {
            console.error('[PreflightGateOverlay] Recheck failed:', err);
          }
          setIsRechecking(false);

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
  }, [failures, onRetry, setCLIStatus]);

  const runCommand = useCallback((command: string, serviceKey: ServiceKey) => {
    const newSessionId = `preflight-${Date.now()}`;
    setSessionId(newSessionId);
    setShowTerminal(true);
    setRunningService(serviceKey);
    setCommandResult(null);
  }, []);

  const pendingCommandRef = useRef<{ command: string; serviceKey: ServiceKey } | null>(null);

  const handleAction = useCallback((serviceKey: ServiceKey, action: 'install' | 'auth') => {
    const info = SERVICE_REGISTRY[serviceKey];
    const command = action === 'install' ? info.installCommand : info.authCommand;
    pendingCommandRef.current = { command, serviceKey };
    runCommand(command, serviceKey);
  }, [runCommand]);

  const handleTerminalReady = useCallback(async () => {
    if (pendingCommandRef.current) {
      try {
        await window.api.setup.runCommand(
          pendingCommandRef.current.command,
          sessionIdRef.current
        );
      } catch (err) {
        console.error('[PreflightGateOverlay] Command failed:', err);
        setCommandResult('error');
        setRunningService(null);
      }
      pendingCommandRef.current = null;
    }
  }, []);

  const handleTerminalInput = useCallback((data: string) => {
    window.api.setup.sendInput(sessionIdRef.current, data);
  }, []);

  const handleCloseTerminal = useCallback(() => {
    if (runningService) {
      window.api.setup.killSession(sessionId);
      setRunningService(null);
    }
    setShowTerminal(false);
    setCommandResult(null);
  }, [runningService, sessionId]);

  const handleRecheckAll = useCallback(async () => {
    setIsRechecking(true);
    try {
      const status = await window.api.cli.checkAll();
      setCLIStatus(status);

      const stillFailing = failures.some((f) => {
        const svc = status[f.key];
        return !svc?.installed || !svc?.authenticated;
      });

      if (!stillFailing) {
        onRetry();
      }
    } catch (err) {
      console.error('[PreflightGateOverlay] Recheck failed:', err);
    }
    setIsRechecking(false);
  }, [failures, onRetry, setCLIStatus]);

  return (
    <div className="absolute inset-0 z-50 bg-surface-light/80 backdrop-blur-sm flex items-center justify-center">
      <div className="card-panel p-8 max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-spectrum-orange/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-spectrum-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-sans font-semibold text-ink">Setup Required</h2>
            <p className="text-sm text-ink-muted">
              Some tools need to be configured to {context}
            </p>
          </div>
        </div>

        {/* Failing services */}
        <div className="space-y-3 mb-6">
          {failures.map((failure) => {
            const info = SERVICE_REGISTRY[failure.key];
            const needsInstall = !failure.installed;
            const needsAuth = failure.installed && !failure.authenticated;

            return (
              <div
                key={failure.key}
                className="bg-error/5 border border-error/20 px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-ink">{info.name}</span>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {needsInstall ? 'Not installed' : 'Not authenticated'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleAction(failure.key, needsInstall ? 'install' : 'auth')}
                    disabled={runningService !== null}
                    className="btn-solid-primary px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {runningService === failure.key ? (
                      <span className="flex items-center">
                        <div className="w-3.5 h-3.5 mr-1.5 border-2 border-accent border-t-transparent animate-spin" />
                        Running...
                      </span>
                    ) : needsInstall ? (
                      'Install'
                    ) : (
                      'Authenticate'
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleRecheckAll}
            disabled={isRechecking}
            className="btn-solid w-full flex items-center justify-center space-x-2 px-4 py-2.5 disabled:opacity-50"
          >
            {isRechecking ? (
              <div className="w-4 h-4 border-2 border-accent border-t-transparent animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            <span>{isRechecking ? 'Checking...' : 'Recheck All'}</span>
          </button>

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-sm text-ink-muted hover:text-ink-secondary transition-colors"
            >
              Continue Anyway
            </button>
          )}
        </div>
      </div>

      {/* Terminal Modal */}
      {showTerminal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
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
                {runningService && (
                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-accent/15 text-accent">
                    <div className="w-3 h-3 mr-1 border-2 border-accent border-t-transparent animate-spin" />
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
