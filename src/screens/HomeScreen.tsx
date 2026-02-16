import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import ProjectCard from '../components/ProjectCard';
import PaywallModal from '../components/PaywallModal';

export default function HomeScreen() {
  const { projects, startNewProject, loadProject, refreshProjects, setScreen, setCLIStatus, cliStatus } = useAppStore();
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const handleNewProject = async () => {
    const config = await window.api.storage.getConfig();
    if (config.freeProjectUsed && !config.devMode) {
      setShowPaywall(true);
      return;
    }
    startNewProject();
  };

  // Check CLI status on mount (non-blocking, no redirect)
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await window.api.cli.checkAll();
        setCLIStatus(status);
      } catch (err) {
        console.error('Failed to check CLI status:', err);
      }
    };
    checkStatus();
  }, [setCLIStatus]);

  const handleLoadProject = async (slug: string) => {
    setLoadingSlug(slug);
    try {
      await loadProject(slug);
    } finally {
      setLoadingSlug(null);
    }
  };

  const handleDeleteProject = async (slug: string) => {
    const project = projects.find(p => p.slug === slug);
    if (!project) return;

    let cleanupMsg = 'This will move the project folder to Trash.';
    if (project.githubRepo) {
      cleanupMsg += ' The GitHub repo will also be deleted.';
    }

    if (!confirm(`Delete "${project.name}"?\n\n${cleanupMsg}`)) return;

    // Delete GitHub repo (non-blocking — failure shouldn't prevent local cleanup)
    if (project.githubRepo) {
      try {
        await window.api.github.deleteRepo(project.githubRepo);
      } catch (err) {
        console.error('Failed to delete GitHub repo:', err);
      }
    }

    await window.api.storage.deleteProject(slug);
    await refreshProjects();
  };

  const claudeReady = cliStatus?.claude?.installed && cliStatus?.claude?.authenticated;
  const githubReady = cliStatus?.github?.installed && cliStatus?.github?.authenticated;

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
  ];

  return (
    <div className="flex-1 overflow-hidden flex">
      {/* Sidebar */}
      <div className="w-[90px] sidebar-warm flex flex-col items-center flex-shrink-0">
        {/* Traffic lights spacer + drag region */}
        <div className="w-full h-14 drag-region flex-shrink-0" />

        {/* Spacer pushes everything to bottom */}
        <div className="flex-1" />

        {/* Connected Services */}
        <div className="w-full flex flex-col items-center gap-3.5 mb-6">
          {services.map((service) => (
            <button
              key={service.name}
              onClick={() => setScreen('onboarding')}
              className="group relative no-drag"
              title={`${service.name}: ${service.ready ? 'Connected' : 'Not connected'}`}
            >
              <div className={`w-10 h-10 flex items-center justify-center transition-all duration-200 border-2 sidebar-icon rounded-md ${
                service.ready
                  ? 'bg-success/15 text-success border-success/30'
                  : 'bg-surface text-ink-muted border-border'
              }`}>
                {service.icon}
              </div>
              {/* Tooltip */}
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-ink text-surface-light text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                {service.name}
                <span className={service.ready ? 'text-success' : 'text-ink-muted'}> — {service.ready ? 'Connected' : 'Not connected'}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-9 divider-warm mb-5" />

        {/* Settings */}
        <div className="mb-6">
          <button
            onClick={() => setScreen('settings')}
            className="group relative no-drag"
            title="Settings"
          >
            <div className="w-10 h-10 border-2 border-border hover:border-ink-muted flex items-center justify-center text-ink-muted hover:text-ink-secondary sidebar-icon rounded-md">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-ink text-surface-light text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
              Settings
            </div>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="border-b border-border px-4 py-3 drag-region">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-lg tracking-wide font-bold text-secondary flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.13 22.19L11.5 18.36C13.07 17.78 14.54 17 15.9 16.09L13.13 22.19M5.64 12.5L1.81 10.87L7.91 8.1C7 9.46 6.22 10.93 5.64 12.5M21.61 2.39C21.61 2.39 16.66 .269 11 5.93C8.81 8.12 7.5 10.53 6.65 12.64C6.37 13.39 6.56 14.21 7.11 14.77L9.24 16.89C9.79 17.45 10.61 17.63 11.36 17.35C13.5 16.53 15.88 15.19 18.07 13C23.73 7.34 21.61 2.39 21.61 2.39M14.54 9.46C13.76 8.68 13.76 7.41 14.54 6.63S16.59 5.85 17.37 6.63C18.14 7.41 18.15 8.68 17.37 9.46C16.59 10.24 15.32 10.24 14.54 9.46M8.88 16.53L7.47 15.12L8.88 16.53M6.24 22L9.88 18.36C9.54 18.27 9.21 18.12 8.91 17.91L4.83 22H6.24M2 22H3.41L8.18 17.24L6.76 15.83L2 20.59V22M2 19.17L6.09 15.09C5.88 14.79 5.73 14.46 5.64 14.12L2 17.76V19.17Z" />
              </svg>
              Houston
            </h1>
            <button
              onClick={handleNewProject}
              disabled={loadingSlug !== null}
              className="btn-solid-primary flex items-center space-x-2 no-drag"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>NEW PROJECT</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-24 h-24 bg-surface border border-border flex items-center justify-center mb-4">
                <svg className="w-12 h-12 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-sans font-semibold text-ink mb-2">No Projects Yet</h2>
              <p className="text-ink-muted mb-6 max-w-md text-sm">
                Start your first project and let Claude Code help you build and deploy your MVP.
              </p>
              <button
                onClick={handleNewProject}
                className="btn-solid-primary flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>CREATE YOUR FIRST PROJECT</span>
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
                  {loadingSlug === project.slug && (
                    <div className="absolute inset-0 bg-surface-card/80 flex items-center justify-center">
                      <div className="flex items-center space-x-2 text-accent">
                        <div className="w-5 h-5 border-2 border-accent border-t-transparent animate-spin" />
                        <span className="font-display uppercase text-[13px] tracking-wider">LOADING...</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>

        {showPaywall && (
          <PaywallModal
            onDismiss={() => setShowPaywall(false)}
            onUpgradeComplete={() => {
              setShowPaywall(false);
              startNewProject();
            }}
          />
        )}
      </div>
    </div>
  );
}
