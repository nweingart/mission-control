import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import ReactMarkdown from 'react-markdown';

type ProvisioningPhase = 'idle' | 'inferring' | 'provisioning' | 'done' | 'skipped';

export default function PRDReviewScreen() {
  const {
    currentProject,
    updateProject,
    goToHome,
    goToDiscovery,
    goToPlanning,
    cliStatus,
  } = useAppStore();

  const [prd, setPrd] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [provisioningPhase, setProvisioningPhase] = useState<ProvisioningPhase>('idle');
  const [provisioningMessage, setProvisioningMessage] = useState('');
  const [provisioningError, setProvisioningError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      window.api.supabase.removeListeners();
    };
  }, []);

  useEffect(() => {
    const loadPRD = async () => {
      if (!currentProject) return;

      try {
        const prdContent = await window.api.storage.getPRD(currentProject.slug);
        setPrd(prdContent);
      } catch (err) {
        console.error('Failed to load PRD:', err);
        setError('Failed to load PRD');
      } finally {
        setIsLoading(false);
      }
    };

    loadPRD();
  }, [currentProject]);

  const proceedToPlanning = async () => {
    await updateProject({ status: 'planning' });
    goToPlanning();
  };

  const handleApprove = async () => {
    if (!currentProject) return;

    // Check if Supabase CLI is authenticated — if not, skip provisioning entirely
    if (!cliStatus?.supabase?.authenticated) {
      console.log('[PRDReviewScreen] Supabase CLI not authenticated, skipping provisioning');
      await proceedToPlanning();
      return;
    }

    // Phase 1: Infer whether the app needs a database
    if (!isMountedRef.current) return;
    setProvisioningPhase('inferring');
    setProvisioningMessage('Analyzing whether your app needs a database...');
    setProvisioningError(null);

    try {
      const prdContent = prd || currentProject.idea || '';
      const inferencePrompt = `You are deciding whether a web application needs a database/backend. Based on the following product requirements, does this app need a database? Answer ONLY "yes" or "no" — nothing else.

Product Requirements:
${prdContent}`;

      const response = await window.api.claude.chat(currentProject.projectPath, inferencePrompt);
      if (!isMountedRef.current) return;

      const needsDatabase = response.trim().toLowerCase().startsWith('yes');

      if (!needsDatabase) {
        console.log('[PRDReviewScreen] Claude says no database needed, skipping provisioning');
        setProvisioningPhase('skipped');
        await proceedToPlanning();
        return;
      }

      // Phase 2: Create Supabase project
      if (!isMountedRef.current) return;
      setProvisioningPhase('provisioning');
      setProvisioningMessage('Creating your Supabase project...');

      window.api.supabase.onOutput((data) => {
        if (!isMountedRef.current) return;
        if (data.content.trim()) {
          setProvisioningMessage(data.content.trim());
        }
      });

      const result = await window.api.supabase.createProject(currentProject.name);
      window.api.supabase.removeListeners();

      if (!isMountedRef.current) return;

      // Validate that we got real API keys back
      if (!result.anonKey) {
        throw new Error('Supabase project created but API keys could not be retrieved. Check your Supabase dashboard for project credentials.');
      }

      // Store Supabase ref + env vars on the project
      const envVars = {
        ...(currentProject.envVars || {}),
        NEXT_PUBLIC_SUPABASE_URL: result.url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: result.anonKey,
        SUPABASE_SERVICE_ROLE_KEY: result.serviceKey,
      };
      await updateProject({
        supabaseRef: result.ref,
        envVars,
      });

      // Write .env.local so local dev works after cloning
      const envFileContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n';
      await window.api.fs.writeFile(
        `${currentProject.projectPath}/.env.local`,
        envFileContent
      );

      // Run any pending migrations (non-fatal — project may not have migrations yet)
      try {
        setProvisioningMessage('Running database migrations...');
        await window.api.supabase.runMigrations(currentProject.projectPath, result.ref);
      } catch (migrationErr) {
        console.warn('[PRDReviewScreen] Migrations skipped:', migrationErr);
      }

      // Phase 3: Done
      if (!isMountedRef.current) return;
      setProvisioningPhase('done');
      setProvisioningMessage('Database ready! Proceeding to planning...');

      // Pause 1.5s then proceed
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (!isMountedRef.current) return;

      await proceedToPlanning();
    } catch (err: any) {
      console.error('[PRDReviewScreen] Provisioning error:', err);
      if (!isMountedRef.current) return;
      setProvisioningError(err?.message || 'Failed to provision Supabase project');
      setProvisioningMessage('');
    }
  };

  const handleSkipProvisioning = async () => {
    setProvisioningPhase('skipped');
    setProvisioningError(null);
    await proceedToPlanning();
  };

  const handleGoBack = () => {
    goToDiscovery();
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-charcoal-800">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-terracotta-500"></div>
      </div>
    );
  }

  if (error || !prd) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-charcoal-800">
        <div className="text-center">
          <div className="text-rust-500 text-5xl mb-4">!</div>
          <h2 className="text-xl font-semibold text-cream-100 mb-2">Could not load PRD</h2>
          <p className="text-charcoal-200 mb-4">{error || 'PRD not found'}</p>
          <button
            onClick={handleGoBack}
            className="px-4 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600"
          >
            Go Back to Discovery
          </button>
        </div>
      </div>
    );
  }

  // Provisioning overlay — replaces PRD content when active
  if (provisioningPhase !== 'idle') {
    return (
      <div className="flex-1 overflow-hidden flex flex-col bg-charcoal-800">
        {/* Header */}
        <header className="bg-charcoal-800 border-b border-charcoal-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-xl font-bold text-cream-100">{currentProject?.name}</h1>
                <p className="text-charcoal-300 text-sm">Setting up your project</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-charcoal-300">Step 2 of 4</span>
              <div className="flex space-x-1">
                <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
                <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
                <div className="w-2 h-2 rounded-full bg-charcoal-600"></div>
                <div className="w-2 h-2 rounded-full bg-charcoal-600"></div>
              </div>
            </div>
          </div>
        </header>

        {/* Provisioning Status */}
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-6">
            {provisioningError ? (
              <>
                {/* Error state */}
                <div className="w-16 h-16 rounded-full bg-rust-500/15 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-rust-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-cream-100 mb-2">Database Setup Failed</h2>
                <p className="text-charcoal-300 mb-2">{provisioningError}</p>
                <p className="text-sm text-charcoal-400 mb-6">
                  You can set up Supabase manually later from the Preview screen.
                </p>
                <button
                  onClick={handleSkipProvisioning}
                  className="px-6 py-3 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 transition-colors"
                >
                  Continue Without Database
                </button>
              </>
            ) : provisioningPhase === 'done' ? (
              <>
                {/* Success state */}
                <div className="w-16 h-16 rounded-full bg-sage-500/15 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-sage-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-cream-100 mb-2">{provisioningMessage}</h2>
              </>
            ) : (
              <>
                {/* Loading state */}
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-terracotta-500 mx-auto mb-6"></div>
                <h2 className="text-xl font-semibold text-cream-100 mb-2">{provisioningMessage}</h2>
                {provisioningPhase === 'provisioning' && (
                  <p className="text-sm text-charcoal-400">This usually takes 30-60 seconds</p>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-charcoal-800">
      {/* Header */}
      <header className="bg-charcoal-800 border-b border-charcoal-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleGoBack}
              className="text-charcoal-300 hover:text-cream-100 transition-colors no-drag"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-cream-100">{currentProject?.name}</h1>
              <p className="text-charcoal-300 text-sm">Review your Product Requirements Document</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-charcoal-300">Step 2 of 4</span>
            <div className="flex space-x-1">
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-terracotta-500"></div>
              <div className="w-2 h-2 rounded-full bg-charcoal-600"></div>
              <div className="w-2 h-2 rounded-full bg-charcoal-600"></div>
            </div>
          </div>
        </div>
      </header>

      {/* PRD Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          {/* PRD Document */}
          <div className="bg-stone-200 rounded-xl shadow-sm border border-stone-300 p-8">
            <div className="prose prose-gray max-w-none prose-headings:text-charcoal prose-h1:text-2xl prose-h2:text-xl prose-h2:border-b prose-h2:pb-2 prose-h2:mb-4 prose-h3:text-lg prose-p:text-stone-700 prose-li:text-stone-700 prose-strong:text-charcoal prose-code:bg-stone-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-charcoal-950 prose-pre:text-cream-100">
              <ReactMarkdown>{prd}</ReactMarkdown>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex justify-between items-center">
            <button
              onClick={handleGoBack}
              className="flex items-center space-x-2 px-4 py-2 text-charcoal-300 hover:text-cream-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back to Discussion</span>
            </button>

            <button
              onClick={handleApprove}
              className="flex items-center space-x-2 px-6 py-3 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 transition-colors"
            >
              <span>Approve & Generate Tasks</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>

          {/* Help text */}
          <p className="mt-4 text-center text-sm text-charcoal-400">
            Review the PRD above. If you need changes, go back and continue the conversation.
          </p>
        </div>
      </main>
    </div>
  );
}
