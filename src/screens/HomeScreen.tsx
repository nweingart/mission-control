import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import ProjectCard from '../components/ProjectCard';
import FlowTestRunner from '../components/FlowTestRunner';

export default function HomeScreen() {
  const { projects, startNewProject, loadProject, refreshProjects, setScreen, setCLIStatus, cliStatus, resetOnboarding } = useAppStore();
  const [showFlowTest, setShowFlowTest] = useState(false);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  // Just start new project immediately - no blocking checks
  const handleNewProject = () => {
    startNewProject();
  };

  // Check CLI status on mount (non-blocking, no redirect)
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await window.api.cli.checkAll();
        setCLIStatus(status);
        // Don't redirect - just update status for display
      } catch (err) {
        console.error('Failed to check CLI status:', err);
      }
    };

    checkStatus();
  }, [setCLIStatus]);

  // Close settings menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setShowSettingsMenu(false);
      }
    };
    if (showSettingsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettingsMenu]);

  const handleResetOnboarding = () => {
    setShowSettingsMenu(false);
    if (window.confirm('Reset onboarding walkthrough? You will see the intro screens again.')) {
      resetOnboarding();
    }
  };

  const handleLoadProject = async (slug: string) => {
    setLoadingSlug(slug);
    try {
      await loadProject(slug);
    } finally {
      setLoadingSlug(null);
    }
  };

  const handleDeleteProject = async (slug: string) => {
    await window.api.storage.deleteProject(slug);
    await refreshProjects();
  };

  const claudeReady = cliStatus?.claude?.installed && cliStatus?.claude?.authenticated;
  const githubReady = cliStatus?.github?.installed && cliStatus?.github?.authenticated;
  const vercelReady = cliStatus?.vercel?.installed && cliStatus?.vercel?.authenticated;
  const supabaseReady = cliStatus?.supabase?.installed && cliStatus?.supabase?.authenticated;

  const services = [
    {
      name: 'Claude Code',
      ready: claudeReady,
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      name: 'GitHub',
      ready: githubReady,
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      ),
    },
    {
      name: 'Vercel',
      ready: vercelReady,
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 76 65" fill="currentColor">
          <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
        </svg>
      ),
    },
    {
      name: 'Supabase',
      ready: supabaseReady,
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 109 113" fill="currentColor">
          <path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z" fillOpacity="0.7" />
          <path d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.041L54.4849 72.2922H9.83113C1.64038 72.2922 -2.92775 62.8321 2.1655 56.4175L45.317 2.07103Z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex-1 overflow-hidden flex">
      {/* Sidebar */}
      <div className="w-20 bg-charcoal-950 flex flex-col items-center flex-shrink-0">
        {/* Traffic lights spacer + drag region */}
        <div className="w-full h-14 drag-region flex-shrink-0" />

        {/* Spacer pushes everything to bottom */}
        <div className="flex-1" />

        {/* Connected Services */}
        <div className="w-full flex flex-col items-center gap-3.5 mb-6">
          {services.map((service) => (
            <button
              key={service.name}
              onClick={() => setScreen('setup-deploy')}
              className="group relative no-drag"
              title={`${service.name}: ${service.ready ? 'Connected' : 'Not connected'}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                service.ready
                  ? 'bg-sage-500/15 text-sage-400 group-hover:bg-sage-500/25'
                  : 'bg-white/5 text-charcoal-400 group-hover:bg-white/10 group-hover:text-charcoal-300'
              }`}>
                {service.icon}
              </div>
              {/* Tooltip */}
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-charcoal-700 text-cream-100 text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                {service.name}
                <span className={service.ready ? 'text-sage-400' : 'text-charcoal-400'}> — {service.ready ? 'Connected' : 'Not connected'}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-9 border-t border-white/10 mb-5" />

        {/* Settings */}
        <div className="mb-6 relative" ref={settingsMenuRef}>
          <button
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
            className="group relative no-drag"
            title="Settings"
          >
            <div className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-charcoal-400 hover:text-charcoal-200 transition-all duration-200">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            {/* Tooltip (only when menu is closed) */}
            {!showSettingsMenu && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-charcoal-700 text-cream-100 text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                Settings
              </div>
            )}
          </button>
          {/* Settings dropdown */}
          {showSettingsMenu && (
            <div className="absolute left-full ml-3 bottom-0 w-48 bg-charcoal-700 border border-charcoal-600 rounded-lg shadow-xl z-50 py-1">
              <button
                onClick={() => {
                  setShowSettingsMenu(false);
                  setScreen('setup-deploy');
                }}
                className="w-full text-left px-3 py-2 text-sm text-cream-100 hover:bg-charcoal-600 transition-colors"
              >
                Manage Tools
              </button>
              <button
                onClick={() => {
                  setShowSettingsMenu(false);
                  setScreen('setup-workspace');
                }}
                className="w-full text-left px-3 py-2 text-sm text-cream-100 hover:bg-charcoal-600 transition-colors"
              >
                Workspace Directory
              </button>
              <button
                onClick={handleResetOnboarding}
                className="w-full text-left px-3 py-2 text-sm text-cream-100 hover:bg-charcoal-600 transition-colors"
              >
                Reset Onboarding
              </button>
              <div className="border-t border-charcoal-600 my-1" />
              <button
                onClick={() => {
                  setShowSettingsMenu(false);
                  setShowFlowTest(true);
                }}
                className="w-full text-left px-3 py-2 text-sm text-cream-100 hover:bg-charcoal-600 transition-colors"
              >
                Run Flow Test
              </button>
              <button
                onClick={() => {
                  setShowSettingsMenu(false);
                  (window as unknown as { openE2ETest?: () => void }).openE2ETest?.();
                }}
                className="w-full text-left px-3 py-2 text-sm text-cream-100 hover:bg-charcoal-600 transition-colors"
              >
                Run E2E Test
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-charcoal-800 border-b border-charcoal-700 px-4 py-3 drag-region">
          <div className="flex items-center justify-between">
            {/* Logo with Icon */}
            <div className="flex items-center space-x-2">
              <svg className="w-10 h-10" viewBox="0 0 200 200">
                <defs>
                  <linearGradient id="coralGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#E8927C' }} />
                    <stop offset="100%" style={{ stopColor: '#D4806A' }} />
                  </linearGradient>
                  <linearGradient id="handleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style={{ stopColor: '#8B7355' }} />
                    <stop offset="50%" style={{ stopColor: '#9C8465' }} />
                    <stop offset="100%" style={{ stopColor: '#8B7355' }} />
                  </linearGradient>
                </defs>
                <circle cx="100" cy="100" r="95" fill="#1E1E1E" stroke="#E8927C" strokeWidth="3" />
                <g transform="rotate(-40, 100, 100)">
                  <rect x="92" y="55" width="16" height="110" rx="3" fill="url(#handleGrad)" stroke="#6B5D4D" strokeWidth="1" />
                  <line x1="94" y1="130" x2="106" y2="130" stroke="#6B5D4D" strokeWidth="1" />
                  <line x1="94" y1="140" x2="106" y2="140" stroke="#6B5D4D" strokeWidth="1" />
                  <line x1="94" y1="150" x2="106" y2="150" stroke="#6B5D4D" strokeWidth="1" />
                  <rect x="70" y="35" width="60" height="28" rx="4" fill="url(#coralGrad)" stroke="#C97563" strokeWidth="1.5" />
                  <rect x="73" y="38" width="54" height="6" rx="2" fill="#F2A896" opacity="0.5" />
                </g>
                <g transform="rotate(40, 100, 100)">
                  <rect x="92" y="55" width="16" height="110" rx="3" fill="url(#handleGrad)" stroke="#6B5D4D" strokeWidth="1" />
                  <line x1="94" y1="130" x2="106" y2="130" stroke="#6B5D4D" strokeWidth="1" />
                  <line x1="94" y1="140" x2="106" y2="140" stroke="#6B5D4D" strokeWidth="1" />
                  <line x1="94" y1="150" x2="106" y2="150" stroke="#6B5D4D" strokeWidth="1" />
                  <rect x="70" y="35" width="60" height="28" rx="4" fill="url(#coralGrad)" stroke="#C97563" strokeWidth="1.5" />
                  <rect x="73" y="38" width="54" height="6" rx="2" fill="#F2A896" opacity="0.5" />
                </g>
              </svg>
              <h1 className="text-3xl font-logo font-semibold tracking-tight text-cream-100">Forge</h1>
            </div>
            <button
              onClick={handleNewProject}
              disabled={loadingSlug !== null}
              className="flex items-center space-x-2 px-4 py-2 bg-terracotta-500 text-cream-50 rounded-lg hover:bg-terracotta-600 disabled:bg-charcoal-600 disabled:text-charcoal-400 transition-colors no-drag"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>New Project</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-24 h-24 bg-charcoal-700 rounded-full flex items-center justify-center mb-4">
                <svg className="w-12 h-12 text-charcoal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-cream-100 mb-2">No projects yet</h2>
              <p className="text-charcoal-400 mb-6 max-w-md">
                Start your first project and let Claude Code help you build and deploy your MVP.
              </p>
              <button
                onClick={handleNewProject}
                className="flex items-center space-x-2 px-6 py-3 bg-terracotta-500 text-cream-50 rounded-lg hover:bg-terracotta-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Create your first project</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <div key={project.slug} className="relative">
                  <ProjectCard
                    project={project}
                    onClick={() => handleLoadProject(project.slug)}
                    onDelete={() => handleDeleteProject(project.slug)}
                  />
                  {/* Loading overlay */}
                  {loadingSlug === project.slug && (
                    <div className="absolute inset-0 bg-charcoal-800/80 rounded-lg flex items-center justify-center">
                      <div className="flex items-center space-x-2 text-terracotta-500">
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span className="text-sm font-medium">Loading...</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
      {showFlowTest && <FlowTestRunner onClose={() => setShowFlowTest(false)} />}
    </div>
  );
}
