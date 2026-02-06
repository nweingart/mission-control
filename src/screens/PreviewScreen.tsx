import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';

type PreviewStatus = 'starting' | 'running' | 'stopped' | 'error';
type SidebarTab = 'preview' | 'env' | 'files' | 'planning' | 'settings';

interface EnvVar {
  key: string;
  value: string;
}

// Default env vars for a typical Next.js + Supabase project
const DEFAULT_ENV_VARS: EnvVar[] = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', value: '' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: '' },
];

export default function PreviewScreen() {
  const {
    currentProject,
    updateProject,
    goToBuilding,
    goToDeploying,
    flowTestMode,
    goToHome,
    goToPlanningChats,
  } = useAppStore();

  // Early return if no project - prevents null access throughout component
  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center bg-charcoal-800">
        <div className="text-center">
          <p className="text-charcoal-300 mb-4">No project selected</p>
          <button
            onClick={goToHome}
            className="px-4 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  const [status, setStatus] = useState<PreviewStatus>('starting');
  const [output, setOutput] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>('preview');

  // Environment variables state
  const [envVars, setEnvVars] = useState<EnvVar[]>(() => {
    if (currentProject?.envVars && Object.keys(currentProject.envVars).length > 0) {
      return Object.entries(currentProject.envVars).map(([key, value]) => ({ key, value }));
    }
    return DEFAULT_ENV_VARS;
  });
  const [envSaveStatus, setEnvSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const outputRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Start dev server on mount (skip in flow test mode)
  useEffect(() => {
    if (flowTestMode) return;
    if (!currentProject?.projectPath) return;

    const startServer = async () => {
      try {
        setStatus('starting');
        setError(null);
        setOutput([]);

        // Register output listener
        window.api.devServer.onOutput((data) => {
          if (!isMountedRef.current) return;

          setOutput((prev) => {
            const newOutput = [...prev, data.content];
            // Limit to last 500 lines
            if (newOutput.length > 500) {
              return newOutput.slice(-500);
            }
            return newOutput;
          });

          // Detect when server is ready
          const content = data.content.toLowerCase();
          if (content.includes('localhost:') || content.includes('ready') || content.includes('started')) {
            // Extract URL from output
            const urlMatch = data.content.match(/https?:\/\/localhost:\d+/i);
            if (urlMatch) {
              setServerUrl(urlMatch[0]);
              setStatus('running');
            } else if (content.includes('localhost:3000') || content.includes(':3000')) {
              setServerUrl('http://localhost:3000');
              setStatus('running');
            }
          }
        });

        window.api.devServer.onExit((data) => {
          if (!isMountedRef.current) return;
          console.log('[PreviewScreen] Dev server exited with code:', data.code);
          setStatus('stopped');
        });

        // Start the server
        const id = await window.api.devServer.start(currentProject.projectPath);
        if (isMountedRef.current) {
          setSessionId(id);
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to start dev server');
        setStatus('error');
      }
    };

    startServer();

    // Cleanup on unmount
    return () => {
      window.api.devServer.stop();
      window.api.devServer.removeListeners();
    };
  }, [currentProject?.projectPath]);

  const openInBrowser = () => {
    if (serverUrl) {
      window.api.devServer.openBrowser(serverUrl);
    }
  };

  const openInEditor = () => {
    if (currentProject?.projectPath) {
      window.api.shell.openInEditor(currentProject.projectPath);
    }
  };

  const stopAndContinue = async () => {
    await window.api.devServer.stop();
    goToDeploying();
  };

  const restartServer = async () => {
    if (!currentProject?.projectPath) return;

    setStatus('starting');
    setError(null);
    setOutput([]);
    setServerUrl(null);

    try {
      const id = await window.api.devServer.start(currentProject.projectPath);
      setSessionId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart dev server');
      setStatus('error');
    }
  };

  // Environment variable management
  const updateEnvVar = useCallback((index: number, field: 'key' | 'value', newValue: string) => {
    setEnvVars(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: newValue };
      return updated;
    });
    setEnvSaveStatus('idle');
  }, []);

  const addEnvVar = useCallback(() => {
    setEnvVars(prev => [...prev, { key: '', value: '' }]);
    setEnvSaveStatus('idle');
  }, []);

  const removeEnvVar = useCallback((index: number) => {
    setEnvVars(prev => prev.filter((_, i) => i !== index));
    setEnvSaveStatus('idle');
  }, []);

  const saveEnvVars = useCallback(async () => {
    if (!currentProject) return;

    setEnvSaveStatus('saving');

    // Convert array to object, filtering out empty keys
    const envVarsObj: Record<string, string> = {};
    envVars.forEach(({ key, value }) => {
      if (key.trim()) {
        envVarsObj[key.trim()] = value;
      }
    });

    try {
      await updateProject({ envVars: envVarsObj });
      setEnvSaveStatus('saved');
      setTimeout(() => setEnvSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to save env vars:', err);
      setEnvSaveStatus('idle');
    }
  }, [currentProject, envVars, updateProject]);

  const sidebarItems = [
    { id: 'preview' as SidebarTab, label: 'Preview', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    )},
    { id: 'env' as SidebarTab, label: 'Environment', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    )},
    { id: 'files' as SidebarTab, label: 'Files', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    )},
    { id: 'planning' as SidebarTab, label: 'Planning', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )},
    { id: 'settings' as SidebarTab, label: 'Settings', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )},
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-charcoal-800 border-b border-charcoal-600 px-6 py-4 drag-region header-with-traffic-lights flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={goToBuilding}
              className="text-charcoal-300 hover:text-cream-100 transition-colors no-drag"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-cream-100">{currentProject?.name}</h1>
              <p className="text-charcoal-300 text-sm">Preview - See your app in action</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-charcoal-300">Step 4 of 5</span>
            <div className="flex space-x-1">
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-charcoal-600"></div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content with sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-charcoal-900 border-r border-charcoal-600 flex flex-col flex-shrink-0">
          <nav className="flex-1 p-4 space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  activeTab === item.id
                    ? 'bg-terracotta-500/15 text-terracotta-500'
                    : 'text-charcoal-300 hover:bg-charcoal-700'
                }`}
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Quick Actions */}
          <div className="p-4 border-t border-charcoal-600 space-y-2">
            <button
              onClick={openInEditor}
              className="w-full flex items-center space-x-2 px-3 py-2 text-charcoal-300 hover:bg-charcoal-700 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span className="text-sm">Open in Editor</span>
            </button>
            <button
              onClick={stopAndContinue}
              className="w-full flex items-center space-x-2 px-3 py-2 bg-sage-500 text-charcoal-950 rounded-lg hover:bg-sage-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm font-medium">Deploy</span>
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Preview Tab */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              {/* Status Card */}
              <div className="bg-charcoal-700 rounded-lg border border-charcoal-600 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {/* Status indicator */}
                    {status === 'starting' && (
                      <>
                        <div className="w-10 h-10 rounded-full bg-terracotta-500/15 flex items-center justify-center">
                          <svg className="w-5 h-5 text-terracotta-500 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-semibold text-cream-100">Starting dev server...</h3>
                          <p className="text-sm text-charcoal-300">Running npm run dev</p>
                        </div>
                      </>
                    )}

                    {status === 'running' && (
                      <>
                        <div className="w-10 h-10 rounded-full bg-sage-500/15 flex items-center justify-center">
                          <div className="w-3 h-3 rounded-full bg-sage-500 animate-pulse"></div>
                        </div>
                        <div>
                          <h3 className="font-semibold text-cream-100">Server running</h3>
                          <p className="text-sm text-sage-500">{serverUrl}</p>
                        </div>
                      </>
                    )}

                    {status === 'stopped' && (
                      <>
                        <div className="w-10 h-10 rounded-full bg-charcoal-600 flex items-center justify-center">
                          <div className="w-3 h-3 rounded-full bg-charcoal-400"></div>
                        </div>
                        <div>
                          <h3 className="font-semibold text-cream-100">Server stopped</h3>
                          <p className="text-sm text-charcoal-300">The dev server has stopped</p>
                        </div>
                      </>
                    )}

                    {status === 'error' && (
                      <>
                        <div className="w-10 h-10 rounded-full bg-rust-500/15 flex items-center justify-center">
                          <svg className="w-5 h-5 text-rust-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-semibold text-rust-400">Error</h3>
                          <p className="text-sm text-rust-400">{error}</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center space-x-3">
                    {status === 'running' && (
                      <button
                        onClick={openInBrowser}
                        className="flex items-center space-x-2 px-4 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <span>Open in Browser</span>
                      </button>
                    )}

                    {(status === 'stopped' || status === 'error') && (
                      <button
                        onClick={restartServer}
                        className="flex items-center space-x-2 px-4 py-2 bg-charcoal-600 text-cream-100 rounded-lg hover:bg-charcoal-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Restart Server</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Terminal Output */}
              <div className="bg-charcoal-950 rounded-lg border border-charcoal-600 overflow-hidden">
                <div className="bg-charcoal-900 px-4 py-2 flex items-center justify-between border-b border-charcoal-600">
                  <span className="text-charcoal-300 text-sm font-medium">Dev Server Output</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-charcoal-400">npm run dev</span>
                    {status === 'running' && <div className="w-2 h-2 rounded-full bg-sage-500 animate-pulse"></div>}
                  </div>
                </div>
                <div
                  ref={outputRef}
                  className="h-96 overflow-y-auto p-4 font-mono text-sm text-charcoal-200 whitespace-pre-wrap"
                >
                  {output.length === 0 ? (
                    <span className="text-charcoal-400">Waiting for output...</span>
                  ) : (
                    output.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Environment Tab */}
          {activeTab === 'env' && (
            <div className="space-y-4">
              <div className="bg-charcoal-700 rounded-lg border border-charcoal-600 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-cream-100">Environment Variables</h2>
                    <p className="text-charcoal-300 text-sm">
                      Configure environment variables for your project. These will be used during deployment.
                    </p>
                  </div>
                  <button
                    onClick={saveEnvVars}
                    disabled={envSaveStatus === 'saving'}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                      envSaveStatus === 'saved'
                        ? 'bg-sage-500/15 text-sage-400'
                        : 'bg-terracotta-500 text-charcoal-950 hover:bg-terracotta-600'
                    }`}
                  >
                    {envSaveStatus === 'saving' && (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {envSaveStatus === 'saved' && (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span>{envSaveStatus === 'saved' ? 'Saved!' : 'Save'}</span>
                  </button>
                </div>

                {/* Env var list */}
                <div className="space-y-3">
                  {envVars.map((envVar, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={envVar.key}
                        onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                        placeholder="VARIABLE_NAME"
                        className="w-1/3 px-3 py-2 border border-charcoal-500 rounded-lg font-mono text-sm focus:ring-2 focus:ring-terracotta-500 focus:border-terracotta-500 bg-charcoal-800 text-cream-100"
                      />
                      <span className="text-charcoal-400">=</span>
                      <input
                        type="text"
                        value={envVar.value}
                        onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                        placeholder="value"
                        className="flex-1 px-3 py-2 border border-charcoal-500 rounded-lg font-mono text-sm focus:ring-2 focus:ring-terracotta-500 focus:border-terracotta-500 bg-charcoal-800 text-cream-100"
                      />
                      <button
                        onClick={() => removeEnvVar(index)}
                        className="p-2 text-charcoal-400 hover:text-rust-500 transition-colors"
                        title="Remove variable"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add new variable button */}
                <button
                  onClick={addEnvVar}
                  className="mt-4 flex items-center space-x-2 text-terracotta-500 hover:text-terracotta-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span className="font-medium">Add Variable</span>
                </button>

                {/* Supabase status */}
                {currentProject?.supabaseRef ? (
                  <div className="mt-6 p-4 bg-sage-500/10 border border-sage-500/30 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <svg className="w-6 h-6 text-sage-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <div>
                        <h4 className="font-medium text-sage-400">Supabase Connected</h4>
                        <p className="text-sm text-sage-500 mt-0.5">
                          Project auto-provisioned — credentials are pre-filled above.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 p-4 bg-sage-500/10 border border-sage-500/30 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <svg className="w-6 h-6 text-sage-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <h4 className="font-medium text-sage-400">Need a Supabase project?</h4>
                        <p className="text-sm text-sage-400 mt-1">
                          Create a free Supabase project to get your database URL and anon key.
                        </p>
                        <button
                          onClick={() => window.api.shell.openExternal('https://supabase.com/dashboard')}
                          className="mt-2 inline-flex items-center space-x-1 text-sm font-medium text-sage-400 hover:text-sage-300 underline"
                        >
                          <span>Go to Supabase Dashboard</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                        <p className="text-xs text-sage-500 mt-2">
                          After creating a project, find your credentials in Project Settings → API
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Help text */}
                <div className="mt-4 p-4 bg-terracotta-500/10 border border-terracotta-500/30 rounded-lg">
                  <p className="text-sm text-terracotta-400">
                    <strong>Tip:</strong> Variables starting with <code className="font-mono bg-terracotta-500/15 px-1 rounded">NEXT_PUBLIC_</code> are
                    exposed to the browser. Keep sensitive keys (like service role keys) without this prefix.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Files Tab */}
          {activeTab === 'files' && (
            <div className="space-y-4">
              <div className="bg-charcoal-700 rounded-lg border border-charcoal-600 p-6">
                <h2 className="text-lg font-semibold text-cream-100 mb-4">Project Files</h2>
                <p className="text-charcoal-300 text-sm mb-4">
                  Your project is located at:
                </p>

                <div className="p-3 bg-charcoal-800 rounded-lg font-mono text-sm text-cream-100 mb-4">
                  {currentProject?.projectPath}
                </div>

                <button
                  onClick={openInEditor}
                  className="flex items-center space-x-2 px-4 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  <span>Open in Editor</span>
                </button>
              </div>
            </div>
          )}

          {/* Planning Tab */}
          {activeTab === 'planning' && (
            <div className="space-y-4">
              <div className="bg-charcoal-700 rounded-lg border border-charcoal-600 p-6">
                <h2 className="text-lg font-semibold text-cream-100 mb-2">V2 Planning</h2>
                <p className="text-charcoal-300 text-sm mb-4">
                  Plan future features and improvements for your project.
                </p>
                <button
                  onClick={goToPlanningChats}
                  className="flex items-center space-x-2 px-4 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span>Open Planning Chats</span>
                </button>
              </div>

              <div className="bg-charcoal-700 rounded-lg border border-charcoal-600 p-6">
                <h3 className="text-md font-semibold text-cream-100 mb-2">What is V2 Planning?</h3>
                <ul className="text-charcoal-300 text-sm space-y-2">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 text-terracotta-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Brainstorm V2 features with Claude</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 text-terracotta-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Build a backlog of future improvements</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 text-terracotta-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Keep planning chats for reference</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="bg-charcoal-700 rounded-lg border border-charcoal-600 p-6">
                <h2 className="text-lg font-semibold text-cream-100 mb-4">Project Settings</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-cream-100 mb-1">Project Name</label>
                    <input
                      type="text"
                      value={currentProject?.name || ''}
                      disabled
                      className="w-full px-3 py-2 border border-charcoal-500 rounded-lg bg-charcoal-800 text-charcoal-300"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-cream-100 mb-1">Project Slug</label>
                    <input
                      type="text"
                      value={currentProject?.slug || ''}
                      disabled
                      className="w-full px-3 py-2 border border-charcoal-500 rounded-lg bg-charcoal-800 text-charcoal-300"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-cream-100 mb-1">Status</label>
                    <input
                      type="text"
                      value={currentProject?.status || ''}
                      disabled
                      className="w-full px-3 py-2 border border-charcoal-500 rounded-lg bg-charcoal-800 text-charcoal-300"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
