import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from './store/useAppStore';
import { useCLIMonitor } from './hooks/useCLIMonitor';
import ErrorBoundary from './components/ErrorBoundary';
import ToolDisconnectedOverlay from './components/ToolDisconnectedOverlay';
import SaveErrorToast from './components/SaveErrorToast';
import FlowTestRunner from './components/FlowTestRunner';
import E2ETestRunner from './components/E2ETestRunner';
import CICDTestRunner from './components/CICDTestRunner';
import HomeScreen from './screens/HomeScreen';
import ImportScreen from './screens/ImportScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import SettingsScreen from './screens/SettingsScreen';
import Houston from './components/Houston';
import ProjectLayout from './components/ProjectLayout';
import ProjectScreenRouter from './components/ProjectScreenRouter';
import { ProjectStoreProvider } from './store/ProjectStoreContext';
import { getOrCreateProjectStore } from './store/projectStoreRegistry';

function App() {
  const { screen, initialize, isLoading, error, openProjectSlugs, activeProjectSlug } = useAppStore();
  const { shouldBlock } = useCLIMonitor();
  const [showFlowTest, setShowFlowTest] = useState(false);
  const [showE2ETest, setShowE2ETest] = useState(false);
  const [showCICDTest, setShowCICDTest] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Cmd+Shift+T to toggle flow test, Cmd+Shift+E for E2E test
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        setShowFlowTest(prev => !prev);
      }
      if (e.metaKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        setShowE2ETest(prev => !prev);
      }
      if (e.metaKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setShowCICDTest(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Expose test triggers for settings screen
  useEffect(() => {
    (window as unknown as { openFlowTest?: () => void }).openFlowTest = () => setShowFlowTest(true);
    (window as unknown as { openE2ETest?: () => void }).openE2ETest = () => setShowE2ETest(true);
    return () => {
      delete (window as unknown as { openFlowTest?: () => void }).openFlowTest;
      delete (window as unknown as { openE2ETest?: () => void }).openE2ETest;
    };
  }, []);

  // Expose CI/CD test trigger for HomeScreen settings menu
  useEffect(() => {
    (window as unknown as { openCICDTest?: () => void }).openCICDTest = () => setShowCICDTest(true);
    return () => {
      delete (window as unknown as { openCICDTest?: () => void }).openCICDTest;
    };
  }, []);

  // Handle houston:// deep links
  const handleDeepLink = useCallback(async (_url: string) => {
    // Deep link handling placeholder
  }, []);

  useEffect(() => {
    window.api.onDeepLink(handleDeepLink);
  }, [handleDeepLink]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface">
        <div className="text-center">
          {/* Pixel-style square loader */}
          <div className="w-12 h-12 border-4 border-ink-muted border-t-transparent mx-auto animate-spin" />
          <p className="mt-4 font-sans font-medium text-sm text-ink-muted">Loading Houston...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface">
        <div className="card-panel text-center p-8 max-w-md">
          <div className="text-error font-display text-3xl mb-4">!</div>
          <h2 className="font-sans font-bold text-lg text-ink mb-3">Something Went Wrong</h2>
          <p className="text-ink-muted mb-4 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-solid-primary"
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  // Global screens — visible when no project is active
  const showGlobal = !activeProjectSlug;

  return (
    <ErrorBoundary>
      <div className="h-screen bg-surface flex flex-col overflow-hidden relative">
        {/* Global screens */}
        {showGlobal && (
          <>
            {screen === 'onboarding' && <OnboardingScreen />}
            {screen === 'home' && <HomeScreen />}
            {screen === 'settings' && <SettingsScreen />}
            {screen === 'import' && <ImportScreen />}
          </>
        )}

        {/* Per-project trees — all mounted, only active visible */}
        {openProjectSlugs.map(slug => (
          <div key={slug} className={slug === activeProjectSlug ? 'contents' : 'hidden'}>
            <ProjectStoreProvider store={getOrCreateProjectStore(slug)}>
              <ProjectLayout>
                <ProjectScreenRouter />
              </ProjectLayout>
            </ProjectStoreProvider>
          </div>
        ))}

        {/* Global overlays */}
        {shouldBlock && <ToolDisconnectedOverlay />}
        <SaveErrorToast />
        {showFlowTest && <FlowTestRunner onClose={() => setShowFlowTest(false)} />}
        {showE2ETest && <E2ETestRunner onClose={() => setShowE2ETest(false)} />}
        {showCICDTest && <CICDTestRunner onClose={() => setShowCICDTest(false)} />}
        <Houston />
      </div>
    </ErrorBoundary>
  );
}

export default App;
