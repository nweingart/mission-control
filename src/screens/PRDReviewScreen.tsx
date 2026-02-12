import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import ReactMarkdown from 'react-markdown';
import { usePreflightCheck } from '../hooks/usePreflightCheck';
import PreflightGateOverlay from '../components/PreflightGateOverlay';
import type { ServiceKey } from '../constants/preflight-requirements';
import { generateSupabaseGuide } from '../utils/supabase-guide';

type ProvisioningPhase = 'idle' | 'inferring' | 'picking_org' | 'picking_project' | 'provisioning' | 'done';

export default function PRDReviewScreen() {
  const {
    currentProject,
    updateProject,
    goToHome,
    goToDiscovery,
    goToPlanning,
  } = useAppStore();

  const requiredServices: ServiceKey[] = ['claude', 'supabase'];
  const preflight = usePreflightCheck(requiredServices);

  const [prd, setPrd] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [provisioningPhase, setProvisioningPhase] = useState<ProvisioningPhase>('idle');
  const [provisioningMessage, setProvisioningMessage] = useState('');
  const [provisioningError, setProvisioningError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [existingProjects, setExistingProjects] = useState<Array<{ ref: string; name: string; orgId: string; region: string }>>([]);
  const [selectedProjectRef, setSelectedProjectRef] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [keyRetryCount, setKeyRetryCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const isMountedRef = useRef(true);
  const lastOrgIdRef = useRef<string | null>(null);

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

    await preflight.runGuarded(async () => {
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
        console.log('[PRDReviewScreen] Claude says no database needed, proceeding directly');
        setProvisioningPhase('done');
        await proceedToPlanning();
        return;
      }

      // Phase 2a: Fetch Supabase organizations
      if (!isMountedRef.current) return;
      setProvisioningMessage('Fetching your Supabase organizations...');

      let orgId: string;
      try {
        const rawOrgs = await window.api.supabase.getOrganizations();
        if (!isMountedRef.current) return;

        // Filter out malformed orgs (no name or placeholder names like dashes)
        const fetchedOrgs = rawOrgs.filter(
          (org) => org.name && org.name.trim().length > 0 && !/^[-\u2013\u2014]+$/.test(org.name.trim())
        );

        if (fetchedOrgs.length === 0) {
          throw new Error('No Supabase organizations found. Create one at supabase.com/dashboard, then hit Retry.');
        } else if (fetchedOrgs.length === 1) {
          orgId = fetchedOrgs[0].id;
          if (!orgId || orgId.trim().length === 0) {
            throw new Error('Could not determine organization ID. Please check your Supabase account at supabase.com/dashboard.');
          }
        } else {
          // Multiple orgs — let user pick
          setOrgs(fetchedOrgs);
          setSelectedOrgId(fetchedOrgs[0].id);
          setProvisioningPhase('picking_org');
          return; // Flow continues in handleOrgSelected
        }
      } catch (orgErr: any) {
        if (!isMountedRef.current) return;
        setProvisioningError(getFriendlyErrorMessage(orgErr?.message || 'Failed to fetch Supabase organizations'));
        setProvisioningMessage('');
        return;
      }

      // Phase 2b: Create Supabase project
      await createSupabaseProject(orgId);
    } catch (err: any) {
      console.error('[PRDReviewScreen] Provisioning error:', err);
      if (!isMountedRef.current) return;
      await handleProvisioningError(err);
    }
    }); // end preflight.runGuarded
  };

  const handleOrgSelected = async () => {
    if (!selectedOrgId || !currentProject) return;
    if (!selectedOrgId.trim()) {
      setProvisioningError('Invalid organization selected. Please pick a different organization.');
      return;
    }
    setProvisioningPhase('provisioning');
    setProvisioningError(null);
    try {
      await createSupabaseProject(selectedOrgId);
    } catch (err: any) {
      console.error('[PRDReviewScreen] Provisioning error:', err);
      if (!isMountedRef.current) return;
      await handleProvisioningError(err);
    }
  };

  const getFriendlyErrorMessage = (raw: string): string => {
    const lower = raw.toLowerCase();
    if (lower.includes('enoent') || lower.includes('spawn supabase')) {
      return 'The Supabase CLI could not be found. Please install it and try again.';
    }
    if (lower.includes('not authenticated') || lower.includes('access token') || lower.includes('login')) {
      return "Your Supabase session has expired. Run 'supabase login' in your terminal, then retry.";
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return 'The operation timed out. Check your internet connection and try again.';
    }
    if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('network')) {
      return 'Could not connect to Supabase. Check your internet connection and try again.';
    }
    if (lower.includes('api keys could not be retrieved')) {
      return 'Your project was created, but API keys couldn\'t be retrieved. Open the Supabase Dashboard to find them, or retry.';
    }
    if (lower.includes('permission') || lower.includes('forbidden')) {
      return 'You don\'t have permission for this action. Check your Supabase account permissions.';
    }
    // Strip common CLI prefix noise and return core message
    return raw.replace(/^(error|Error|ERROR)[:\s]+/g, '').trim() || raw;
  };

  // Centralized error recovery — never leave the user stranded
  const handleProvisioningError = async (err: any) => {
    const message = err?.message || 'Failed to provision Supabase project';
    const lower = message.toLowerCase();

    // Error classification
    const isLimitError = lower.includes('project limit') || lower.includes('maximum limits') ||
                         lower.includes('exceed') ||
                         (lower.includes('limit') && lower.includes('project'));
    const isOrgError = !isLimitError && (
      message.includes('Organization not found') || message.includes('organization_id') || message.includes('org_id')
    );
    const isTransientError = lower.includes('timeout') || lower.includes('timed out') ||
                             lower.includes('econnrefused') || lower.includes('enotfound') ||
                             lower.includes('network') || lower.includes('socket');
    const isAuthError = lower.includes('not authenticated') || lower.includes('access token') ||
                        lower.includes('login') || lower.includes('unauthorized') ||
                        lower.includes('token is expired');
    const isCLIMissing = lower.includes('enoent') || lower.includes('spawn supabase');
    const isKeyError = lower.includes('api key') || lower.includes('could not be retrieved') ||
                       lower.includes('could not be parsed');

    if (isLimitError) {
      // Hit project limit — offer to share an existing project's DB
      await offerExistingProjects();
    } else if (isOrgError) {
      // Org is stale/wrong — re-fetch and let user pick again
      console.log('[PRDReviewScreen] Org error detected, re-fetching organizations...');
      setProvisioningError(null);
      setProvisioningMessage('Organization issue detected. Refreshing your organizations...');
      try {
        const rawOrgs = await window.api.supabase.getOrganizations();
        if (!isMountedRef.current) return;

        const freshOrgs = rawOrgs.filter(
          (org) => org.name && org.name.trim().length > 0 && !/^[-\u2013\u2014]+$/.test(org.name.trim())
        );

        if (freshOrgs.length === 0) {
          setProvisioningError('No Supabase organizations found. Create one at supabase.com/dashboard, then hit Retry.');
          setProvisioningMessage('');
        } else {
          setOrgs(freshOrgs);
          setSelectedOrgId(freshOrgs[0].id);
          setProvisioningPhase('picking_org');
          setProvisioningMessage('');
        }
      } catch (fetchErr: any) {
        if (!isMountedRef.current) return;
        setProvisioningError('Could not reach Supabase. Check your internet connection and try again.');
        setProvisioningMessage('');
      }
    } else if (isTransientError && retryCount < 3) {
      // Auto-retry transient errors up to 3 times with exponential backoff
      const nextRetry = retryCount + 1;
      setRetryCount(nextRetry);
      setProvisioningError(null);
      setProvisioningMessage(`Connection issue — retrying (${nextRetry}/3)...`);
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, retryCount)));
      if (!isMountedRef.current) return;
      if (lastOrgIdRef.current) {
        try {
          await createSupabaseProject(lastOrgIdRef.current);
        } catch (retryErr: any) {
          if (!isMountedRef.current) return;
          await handleProvisioningError(retryErr);
        }
      } else {
        // No org ID saved — restart from the beginning
        handleRetry();
      }
    } else if (isTransientError) {
      setProvisioningError(`Could not connect to Supabase after ${retryCount} attempts. Check your internet connection and try again.`);
      setProvisioningMessage('');
    } else if (isAuthError) {
      // Open Supabase dashboard for re-authentication
      setProvisioningError(null);
      setProvisioningMessage('Re-authenticating with Supabase...');
      try {
        await window.api.shell.openExternal('https://supabase.com/dashboard');
        setProvisioningError('Please log in to Supabase in your browser, then click Retry.');
      } catch {
        setProvisioningError("Your Supabase session has expired. Run 'supabase login' in your terminal, then click Retry.");
      }
      setProvisioningMessage('');
    } else if (isCLIMissing) {
      setProvisioningError("The Supabase CLI is not installed. Install it with 'brew install supabase/tap/supabase' (macOS) or 'npm install -g supabase' and then click Retry.");
      setProvisioningMessage('');
    } else if (isKeyError) {
      // Extract project ref from error message (pattern: project "xxx" was created)
      const refMatch = message.match(/project\s+"([^"]+)"\s+was created/i);
      const projectRef = refMatch?.[1];

      if (projectRef && keyRetryCount < 3) {
        const nextKeyRetry = keyRetryCount + 1;
        setKeyRetryCount(nextKeyRetry);
        setProvisioningError(null);
        setProvisioningMessage(`API keys not ready yet — retrying (${nextKeyRetry}/3)...`);
        await new Promise(r => setTimeout(r, 8000 * Math.pow(2, keyRetryCount)));
        if (!isMountedRef.current) return;
        try {
          const keys = await window.api.supabase.getProjectKeys(projectRef);
          if (keys.anonKey && keys.serviceKey && currentProject) {
            // Keys retrieved successfully — store and continue provisioning
            setKeyRetryCount(0);
            const envVars = {
              ...(currentProject.envVars || {}),
              NEXT_PUBLIC_SUPABASE_URL: keys.url,
              NEXT_PUBLIC_SUPABASE_ANON_KEY: keys.anonKey,
              SUPABASE_SERVICE_ROLE_KEY: keys.serviceKey,
            };
            await updateProject({ supabaseRef: keys.ref, envVars });
            await window.api.fs.writeFile(
              `${currentProject.projectPath}/.env.local`,
              Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
            );
            try {
              setProvisioningMessage('Running database migrations...');
              await window.api.supabase.runMigrations(currentProject.projectPath, keys.ref);
            } catch (migrationErr) {
              console.warn('[PRDReviewScreen] Migrations skipped:', migrationErr);
            }
            if (!isMountedRef.current) return;
            setProvisioningPhase('done');
            setProvisioningMessage('Database ready! Proceeding to planning...');
            await new Promise(r => setTimeout(r, 1500));
            if (!isMountedRef.current) return;
            await proceedToPlanning();
            return;
          }
          // Keys still empty — recurse through handleProvisioningError
          await handleProvisioningError(new Error(`Supabase project "${projectRef}" was created, but API keys could not be retrieved.`));
        } catch (retryErr: any) {
          if (!isMountedRef.current) return;
          await handleProvisioningError(retryErr);
        }
      } else {
        setProvisioningError('API keys could not be retrieved. Click Retry to try again.');
        setProvisioningMessage('');
      }
    } else {
      setProvisioningError(getFriendlyErrorMessage(message));
      setProvisioningMessage('');
    }
  };

  // When project creation hits the free-tier limit, offer existing projects to share
  const offerExistingProjects = async () => {
    console.log('[PRDReviewScreen] Project limit hit, fetching existing projects...');
    setProvisioningError(null);
    setProvisioningMessage('Project limit reached. Loading your existing projects...');
    try {
      const projects = await window.api.supabase.getProjects();
      if (!isMountedRef.current) return;

      // Filter to projects in the selected org if we have one, otherwise show all
      const relevantProjects = selectedOrgId
        ? projects.filter((p) => p.orgId === selectedOrgId)
        : projects;

      if (relevantProjects.length === 0) {
        setProvisioningError('No existing projects found. Upgrade your Supabase plan to create more projects, then hit Retry.');
        setProvisioningMessage('');
      } else {
        setExistingProjects(relevantProjects);
        setSelectedProjectRef(relevantProjects[0].ref);
        setProvisioningPhase('picking_project');
        setProvisioningMessage('');
      }
    } catch (fetchErr: any) {
      if (!isMountedRef.current) return;
      setProvisioningError('Could not fetch existing projects. Check your connection and try again.');
      setProvisioningMessage('');
    }
  };

  const handleProjectSelected = async () => {
    if (!selectedProjectRef || !currentProject) return;
    setProvisioningPhase('provisioning');
    setProvisioningError(null);
    setProvisioningMessage('Fetching database credentials...');

    try {
      const result = await window.api.supabase.getProjectKeys(selectedProjectRef);
      if (!isMountedRef.current) return;

      if (!result.anonKey) {
        throw new Error('Could not retrieve API keys for the selected project. Check your Supabase dashboard.');
      }

      // Schema isolation — this project shares an existing DB
      const supabaseSchema = `kiln_${currentProject.slug.replace(/[^a-z0-9_]/g, '_')}`;

      // Store Supabase ref + env vars on the project
      const envVars = {
        ...(currentProject.envVars || {}),
        NEXT_PUBLIC_SUPABASE_URL: result.url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: result.anonKey,
        SUPABASE_SERVICE_ROLE_KEY: result.serviceKey,
      };
      await updateProject({
        supabaseRef: result.ref,
        supabaseSchema,
        envVars,
      });

      // Write SUPABASE_GUIDE.md to the generated project
      const guideContent = generateSupabaseGuide(supabaseSchema, envVars);
      await window.api.fs.writeFile(
        `${currentProject.projectPath}/SUPABASE_GUIDE.md`,
        guideContent
      );

      // Write initial schema migration
      await window.api.fs.writeFile(
        `${currentProject.projectPath}/supabase/migrations/0000_create_schema.sql`,
        `CREATE SCHEMA IF NOT EXISTS ${supabaseSchema};\n`
      );

      // Write .env.local with schema
      const envFileContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + `\nSUPABASE_SCHEMA=${supabaseSchema}\n`;
      await window.api.fs.writeFile(
        `${currentProject.projectPath}/.env.local`,
        envFileContent
      );

      if (!isMountedRef.current) return;
      setProvisioningPhase('done');
      setProvisioningMessage('Database connected! Proceeding to planning...');

      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (!isMountedRef.current) return;
      await proceedToPlanning();
    } catch (err: any) {
      console.error('[PRDReviewScreen] Error using existing project:', err);
      if (!isMountedRef.current) return;
      setProvisioningError(getFriendlyErrorMessage(err?.message || 'Failed to connect to existing project'));
      setProvisioningMessage('');
    }
  };

  const handleRetry = () => {
    setProvisioningPhase('idle');
    setProvisioningError(null);
    setProvisioningMessage('');
    setOrgs([]);
    setSelectedOrgId(null);
    setRetryCount(0);
    setKeyRetryCount(0);
    handleApprove();
  };

  const createSupabaseProject = async (orgId: string) => {
    if (!currentProject) return;
    if (!isMountedRef.current) return;
    lastOrgIdRef.current = orgId;
    setProvisioningPhase('provisioning');
    setProvisioningMessage('Creating your Supabase project...');

    window.api.supabase.onOutput((data) => {
      if (!isMountedRef.current) return;
      if (data.content.trim()) {
        setProvisioningMessage(data.content.trim());
      }
    });

    const result = await window.api.supabase.createProject(currentProject.name, orgId);
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
  };

  const handleGoBack = () => {
    goToDiscovery();
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-card">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent animate-spin"></div>
      </div>
    );
  }

  if (error || !prd) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-surface-card">
        <div className="text-center">
          <div className="text-error text-5xl mb-4">!</div>
          <h2 className="text-base font-sans font-semibold text-ink mb-2">Could not load PRD</h2>
          <p className="text-ink-secondary mb-4">{error || 'PRD not found'}</p>
          <button
            onClick={handleGoBack}
            className="btn-solid-primary px-4 py-2"
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
      <div className="flex-1 overflow-hidden flex flex-col bg-surface-card">
        {/* Header */}
        <header className="bg-surface-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-xl font-sans font-bold text-ink">{currentProject?.name}</h1>
                <p className="text-ink-muted text-sm">Setting up your project</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-ink-muted">Step 2 of 4</span>
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-accent"></div>
                <div className="w-2 h-2 bg-accent"></div>
                <div className="w-2 h-2 bg-border"></div>
                <div className="w-2 h-2 bg-border"></div>
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
                <div className="w-16 h-16 bg-error/15 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h2 className="text-base font-sans font-semibold text-ink mb-2">Database Setup Issue</h2>
                <p className="text-ink-muted mb-6">{provisioningError}</p>
                <div className="flex flex-col items-center space-y-3">
                  <button
                    onClick={handleRetry}
                    className="btn-solid-primary px-6 py-3"
                  >
                    Retry
                  </button>
                </div>
              </>
            ) : provisioningPhase === 'picking_org' ? (
              <>
                {/* Org picker */}
                <h2 className="text-base font-sans font-semibold text-ink mb-2">Select Supabase Organization</h2>
                <p className="text-ink-muted mb-4">
                  You have multiple organizations. Pick one for this project.
                </p>
                <div className="text-left space-y-2 mb-6">
                  {orgs.map((org) => (
                    <label
                      key={org.id}
                      className={`flex items-center p-3 border cursor-pointer transition-colors ${
                        selectedOrgId === org.id
                          ? 'border-accent bg-accent/10'
                          : 'border-border hover:bg-surface-light'
                      }`}
                    >
                      <input
                        type="radio"
                        name="supabase-org"
                        value={org.id}
                        checked={selectedOrgId === org.id}
                        onChange={() => setSelectedOrgId(org.id)}
                        className="mr-3 accent-accent"
                      />
                      <div>
                        <div className="text-sm font-medium text-ink">{org.name}</div>
                        <div className="text-xs text-ink-muted">{org.id}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <button
                  onClick={handleOrgSelected}
                  disabled={!selectedOrgId}
                  className="btn-solid-primary px-6 py-3 disabled:opacity-50"
                >
                  Continue
                </button>
              </>
            ) : provisioningPhase === 'picking_project' ? (
              <>
                {/* Existing project picker — share a DB */}
                <div className="w-12 h-12 bg-accent/15 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
                <h2 className="text-base font-sans font-semibold text-ink mb-2">Share an Existing Database</h2>
                <p className="text-ink-muted mb-4">
                  You've hit the project limit for this organization. Pick an existing project to share its database.
                </p>
                <div className="text-left space-y-2 mb-6">
                  {existingProjects.map((proj) => (
                    <label
                      key={proj.ref}
                      className={`flex items-center p-3 border cursor-pointer transition-colors ${
                        selectedProjectRef === proj.ref
                          ? 'border-accent bg-accent/10'
                          : 'border-border hover:bg-surface-light'
                      }`}
                    >
                      <input
                        type="radio"
                        name="supabase-project"
                        value={proj.ref}
                        checked={selectedProjectRef === proj.ref}
                        onChange={() => setSelectedProjectRef(proj.ref)}
                        className="mr-3 accent-accent"
                      />
                      <div>
                        <div className="text-sm font-medium text-ink">{proj.name}</div>
                        <div className="text-xs text-ink-muted">{proj.ref} &middot; {proj.region}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <button
                  onClick={handleProjectSelected}
                  disabled={!selectedProjectRef}
                  className="btn-solid-primary px-6 py-3 disabled:opacity-50"
                >
                  Use This Database
                </button>
              </>
            ) : provisioningPhase === 'done' ? (
              <>
                {/* Success state */}
                <div className="w-16 h-16 bg-success/15 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-base font-sans font-semibold text-ink mb-2">{provisioningMessage}</h2>
              </>
            ) : (
              <>
                {/* Loading state */}
                <div className="w-12 h-12 border-4 border-accent border-t-transparent animate-spin mx-auto mb-6"></div>
                <h2 className="text-base font-sans font-semibold text-ink mb-2">{provisioningMessage}</h2>
                {provisioningPhase === 'provisioning' && (
                  <p className="text-sm text-ink-muted">This usually takes 30-60 seconds</p>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-surface-card relative">
      {preflight.status === 'blocked' && (
        <PreflightGateOverlay
          failures={preflight.failures}
          onRetry={preflight.retry}
          context="provision your database"
        />
      )}
      {/* Header */}
      <header className="bg-surface-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleGoBack}
              className="text-ink-muted hover:text-ink transition-colors no-drag"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-sans font-bold text-ink">{currentProject?.name}</h1>
              <p className="text-ink-muted text-sm">Review your Product Requirements Document</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-ink-muted">Step 2 of 4</span>
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-accent"></div>
              <div className="w-2 h-2 bg-accent"></div>
              <div className="w-2 h-2 bg-border"></div>
              <div className="w-2 h-2 bg-border"></div>
            </div>
          </div>
        </div>
      </header>

      {/* PRD Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          {/* PRD Document */}
          <div className="card-panel p-8 relative">
            <button
              onClick={() => {
                navigator.clipboard.writeText(prd).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="absolute top-4 right-4 p-2 text-ink-muted hover:text-ink transition-colors"
              title="Copy PRD to clipboard"
            >
              {copied ? (
                <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            <div className="prose max-w-none prose-headings:text-ink prose-h1:text-2xl prose-h2:text-xl prose-h2:border-b prose-h2:pb-2 prose-h2:mb-4 prose-h3:text-lg prose-p:text-ink-secondary prose-li:text-ink-secondary prose-strong:text-ink prose-code:bg-surface-light prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-pre:bg-surface-light prose-pre:text-ink">
              <ReactMarkdown>{prd}</ReactMarkdown>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex justify-between items-center">
            <button
              onClick={handleGoBack}
              className="flex items-center space-x-2 px-4 py-2 text-ink-muted hover:text-ink transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back to Discussion</span>
            </button>

            <button
              onClick={handleApprove}
              className="btn-solid-primary flex items-center space-x-2 px-6 py-3"
            >
              <span>Approve & Generate Tasks</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>

          {/* Help text */}
          <p className="mt-4 text-center text-sm text-ink-muted">
            Review the PRD above. If you need changes, go back and continue the conversation.
          </p>
        </div>
      </main>
    </div>
  );
}
