import type { ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useProjectStore } from '../store/ProjectStoreContext';
import { BuildPipelineProvider } from '../hooks/BuildPipelineContext';
import { getProjectStoreBySlug } from '../store/projectStoreRegistry';
import type { ProjectStatus, Screen } from '../types';
import StreakDisplay from './StreakDisplay';
import GamificationToast from './GamificationToast';
import AssistantGreetingToast from './AssistantGreetingToast';
import ToastNotification from './ToastNotification';

type Tab = 'plan' | 'docs' | 'ship' | 'data' | 'settings';

const statusToScreen: Record<ProjectStatus, Screen> = {
  idea: 'idea',
  discovery: 'discovery',
  prd_review: 'prd-review',
  planning: 'planning',
  building: 'building',
  previewing: 'previewing',
  deploying: 'deploying',
  complete: 'complete',
};

const dockItems: { key: Tab | 'build'; label: string; color: string; activeColor: string; icon: JSX.Element; isBuild?: boolean; requiresBuild?: boolean }[] = [
  {
    key: 'plan',
    label: 'Plan',
    color: 'text-mc-green',
    activeColor: 'bg-mc-green-soft text-mc-green-deep',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    key: 'docs',
    label: 'Docs',
    color: 'text-mc-amber',
    activeColor: 'bg-mc-amber-soft text-mc-amber',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    key: 'build',
    label: 'Build',
    color: 'text-mc-red',
    activeColor: 'bg-mc-red-soft text-mc-red',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    isBuild: true,
  },
  {
    key: 'ship',
    label: 'Ship',
    color: 'text-mc-red',
    activeColor: 'bg-mc-red-soft text-mc-red',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
    requiresBuild: true,
  },
  {
    key: 'data',
    label: 'Data',
    color: 'text-mc-green',
    activeColor: 'bg-mc-green-soft text-mc-green',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    requiresBuild: true,
  },
];

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const currentProject = useProjectStore(s => s.currentProject);
  const screen = useProjectStore(s => s.screen);
  const goToProjectHome = useProjectStore(s => s.goToProjectHome);
  const setScreen = useProjectStore(s => s.setScreen);
  const projectHomeTab = useProjectStore(s => s.projectHomeTab);
  const setProjectHomeTab = useProjectStore(s => s.setProjectHomeTab);
  const goToHome = useAppStore(s => s.goToHome);
  const openProjectSlugs = useAppStore(s => s.openProjectSlugs);
  const activeProjectSlug = useAppStore(s => s.activeProjectSlug);
  const switchProject = useAppStore(s => s.switchProject);
  const closeProject = useAppStore(s => s.closeProject);

  if (!currentProject) return <>{children}</>;

  const isBuildRunning = currentProject.status === 'building' && screen === 'building';
  const phaseScreen = currentProject.status ? (statusToScreen[currentProject.status] || 'building') : 'building';
  const isOnDashboard = screen === 'project-home';
  const isOnBuild = screen === 'building';
  const hasBuiltOnce = currentProject?.hasBuiltOnce === true;

  const confirmLeave = (action: () => void) => {
    if (isBuildRunning) {
      const confirmed = window.confirm(
        'A build is currently in progress. Are you sure you want to leave?'
      );
      if (!confirmed) return;
    }
    action();
  };

  const handleDockClick = (key: Tab) => {
    if (!isOnDashboard) {
      goToProjectHome();
    }
    setProjectHomeTab(key);
  };

  return (
    <BuildPipelineProvider>
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Nav bar */}
      <nav className="bg-surface-light border-b border-border px-4 py-2 drag-region header-with-traffic-lights flex items-center gap-4">
        {/* Home button */}
        <button
          onClick={() => confirmLeave(goToHome)}
          className="text-secondary hover:text-secondary-hover transition-colors no-drag flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-display uppercase text-[13px] tracking-[0.15em] font-semibold">HOME</span>
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-border" />

        {/* Project tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-drag">
          {openProjectSlugs.map(slug => {
            const isActive = slug === activeProjectSlug;
            const store = getProjectStoreBySlug(slug);
            const name = store?.getState().currentProject?.name ?? slug;
            const buildActive = store?.getState().buildSessionActive ?? false;
            return (
              <button
                key={slug}
                onClick={() => switchProject(slug)}
                aria-current={isActive ? 'page' : undefined}
                className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-mc-green-soft text-mc-green-deep'
                    : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
                }`}
              >
                {/* Build status dot */}
                {buildActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-mc-amber animate-pulse" />
                )}
                <span className="truncate max-w-[120px]">{name}</span>
                {/* Close button */}
                {openProjectSlugs.length > 1 && (
                  <span
                    onClick={(e) => { e.stopPropagation(); closeProject(slug); }}
                    className="opacity-0 group-hover:opacity-100 ml-0.5 text-ink-muted hover:text-ink transition-opacity"
                  >
                    &times;
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-border" />

        {/* Gamification stats */}
        <StreakDisplay />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings gear — top right */}
        <button
          onClick={() => { if (!isOnDashboard) goToProjectHome(); setProjectHomeTab('settings'); }}
          className={`no-drag p-1.5 rounded-lg transition-colors ${
            isOnDashboard && projectHomeTab === 'settings'
              ? 'text-secondary bg-mc-green-soft'
              : 'text-ink-muted hover:text-secondary hover:bg-surface-hover'
          }`}
          title="Settings"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </nav>

      {/* Toasts */}
      <GamificationToast />
      <AssistantGreetingToast />
      <ToastNotification />

      {/* Child screen */}
      <div className="flex-1 overflow-hidden flex flex-col pb-20">
        {children}
      </div>

      {/* Floating Bottom Dock */}
      <nav className="dock-bar">
        <div className="flex items-center justify-center gap-3 px-6 py-2">
          {dockItems.map((item) => {
            const isBuildItem = item.isBuild;
            const isLocked = item.requiresBuild && !hasBuiltOnce;
            const isActive = isBuildItem
              ? isOnBuild
              : isOnDashboard && projectHomeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => {
                  if (isLocked) return;
                  if (isBuildItem) {
                    setScreen(phaseScreen);
                  } else {
                    handleDockClick(item.key as Tab);
                  }
                }}
                title={isLocked ? 'Complete a build first' : item.label}
                className={`group relative flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-all duration-150 ${
                  isLocked
                    ? 'opacity-30 cursor-not-allowed'
                    : isActive
                      ? `${item.activeColor} scale-110`
                      : `${item.color} opacity-60 hover:opacity-100 hover:bg-surface-hover`
                }`}
              >
                <div className="w-5 h-5 flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5">
                  {item.icon}
                </div>
                <span className="text-[10px] font-mono font-medium mt-0.5 leading-none">
                  {item.label}
                </span>
                {isActive && !isLocked && (
                  <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-current" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

    </div>
    </BuildPipelineProvider>
  );
}
