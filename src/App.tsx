import { useEffect, useState } from 'react';
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
import Assistant from './components/Assistant';
import ProjectLayout from './components/ProjectLayout';
import ProjectScreenRouter from './components/ProjectScreenRouter';
import { ProjectStoreProvider } from './store/ProjectStoreContext';
import { getOrCreateProjectStore } from './store/projectStoreRegistry';

function App() {
  const screen = useAppStore(s => s.screen);
  const initialize = useAppStore(s => s.initialize);
  const isLoading = useAppStore(s => s.isLoading);
  const error = useAppStore(s => s.error);
  const openProjectSlugs = useAppStore(s => s.openProjectSlugs);
  const activeProjectSlug = useAppStore(s => s.activeProjectSlug);
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
    window.openFlowTest = () => setShowFlowTest(true);
    window.openE2ETest = () => setShowE2ETest(true);
    return () => {
      delete window.openFlowTest;
      delete window.openE2ETest;
    };
  }, []);

  // Expose CI/CD test trigger for HomeScreen settings menu
  useEffect(() => {
    window.openCICDTest = () => setShowCICDTest(true);
    return () => {
      delete window.openCICDTest;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface">
        <div className="text-center">
          {/* Pixel-style square loader */}
          <div className="w-12 h-12 border-4 border-ink-muted border-t-transparent mx-auto animate-spin" role="status" aria-label="Loading" />
          <p className="mt-4 font-sans font-medium text-sm text-ink-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface" role="alert">
        <div className="card-panel text-center p-8 max-w-md">
          <div className="text-error font-display text-3xl mb-4" aria-hidden="true">!</div>
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
        <Assistant />
      </div>
    </ErrorBoundary>
  );
}

export default App;
