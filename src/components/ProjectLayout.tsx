import type { ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { ProjectStatus, Screen } from '../types';

const statusToLabel: Record<ProjectStatus, string> = {
  idea: 'Idea',
  discovery: 'Discovery',
  planning: 'Planning',
  building: 'Build',
  previewing: 'Preview',
  deploying: 'Deploy',
  complete: 'Complete',
};

const statusToScreen: Record<ProjectStatus, Screen> = {
  idea: 'idea',
  discovery: 'discovery',
  planning: 'planning',
  building: 'building',
  previewing: 'previewing',
  deploying: 'deploying',
  complete: 'complete',
};

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const { currentProject, screen, goToHome, setScreen, goToGitHistory } = useAppStore();

  if (!currentProject) return <>{children}</>;

  const phaseLabel = statusToLabel[currentProject.status] || 'Project';
  const phaseScreen = statusToScreen[currentProject.status] || 'home';
  const isPhaseActive = screen !== 'git-history';
  const isGitHistoryActive = screen === 'git-history';

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Nav bar */}
      <nav className="bg-charcoal-800 border-b border-charcoal-600 px-4 py-2 drag-region header-with-traffic-lights flex items-center gap-4">
        {/* Home button */}
        <button
          onClick={goToHome}
          className="text-charcoal-300 hover:text-cream-100 transition-colors no-drag flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm">Home</span>
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-charcoal-600" />

        {/* Project name */}
        <span className="text-sm font-medium text-cream-100 truncate max-w-[200px]">
          {currentProject.name}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Tab buttons */}
        <div className="flex items-center gap-1 no-drag">
          <button
            onClick={() => setScreen(phaseScreen)}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors relative ${
              isPhaseActive
                ? 'text-cream-100'
                : 'text-charcoal-400 hover:text-charcoal-200'
            }`}
          >
            {phaseLabel}
            {isPhaseActive && (
              <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-terracotta-500 rounded-full" />
            )}
          </button>
          <button
            onClick={goToGitHistory}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors relative ${
              isGitHistoryActive
                ? 'text-cream-100'
                : 'text-charcoal-400 hover:text-charcoal-200'
            }`}
          >
            Git History
            {isGitHistoryActive && (
              <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-terracotta-500 rounded-full" />
            )}
          </button>
        </div>
      </nav>

      {/* Child screen */}
      {children}
    </div>
  );
}
