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
import SetupWorkspaceScreen from './screens/SetupWorkspaceScreen';
import SetupDeployScreen from './screens/SetupDeployScreen';
import SetupReadyScreen from './screens/SetupReadyScreen';
import IdeaScreen from './screens/IdeaScreen';
import DiscoveryScreen from './screens/DiscoveryScreen';
import PRDReviewScreen from './screens/PRDReviewScreen';
import TasksScreen from './screens/TasksScreen';
import BuildScreen from './screens/BuildScreen';
import PreviewScreen from './screens/PreviewScreen';
import DeployScreen from './screens/DeployScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import Houston from './components/Houston';
import GitHistoryScreen from './screens/GitHistoryScreen';
import DeploymentsScreen from './screens/DeploymentsScreen';
import GapAnalysisScreen from './screens/GapAnalysisScreen';
import ProjectHomeScreen from './screens/ProjectHomeScreen';
import SettingsScreen from './screens/SettingsScreen';
import ProjectLayout from './components/ProjectLayout';

function App() {
  const { screen, currentProject, initialize, isLoading, error } = useAppStore();
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

  const renderActiveScreen = () => {
    switch (screen) {
      case 'project-home':
        return <ProjectHomeScreen />;
      case 'discovery':
        return <DiscoveryScreen />;
      case 'prd-review':
        return <PRDReviewScreen />;
      case 'planning':
        return <TasksScreen />;
      case 'building':
        return <BuildScreen />;
      case 'previewing':
        return <PreviewScreen />;
      case 'deploying':
        return <DeployScreen />;
      case 'complete':
        return <DeployScreen />;
      case 'git-history':
        return <GitHistoryScreen />;
      case 'deployments':
        return <DeploymentsScreen />;
      case 'gap-analysis':
        return <GapAnalysisScreen />;
      default:
        return <HomeScreen />;
    }
  };

  const renderProjectScreen = () => {
    const buildIsRunning = currentProject?.status === 'building';
    const showBuild = screen === 'building';

    return (
      <>
        {/* Single BuildScreen instance — stays mounted while build is active */}
        {(buildIsRunning || showBuild) && (
          <div className={showBuild ? 'contents' : 'hidden'}>
            <BuildScreen />
          </div>
        )}
        {/* Render other screen when not viewing build */}
        {!showBuild && renderActiveScreen()}
      </>
    );
  };

  const renderScreen = () => {
    switch (screen) {
      case 'onboarding':
        return <OnboardingScreen />;
      case 'setup-workspace':
        return <SetupWorkspaceScreen />;
      case 'setup-deploy':
        return <SetupDeployScreen />;
      case 'setup-ready':
        return <SetupReadyScreen />;
      case 'home':
        return <HomeScreen />;
      case 'settings':
        return <SettingsScreen />;
      case 'idea':
        return <IdeaScreen />;
      default:
        return (
          <ProjectLayout>
            {renderProjectScreen()}
          </ProjectLayout>
        );
    }
  };

  return (
    <ErrorBoundary>
      <div className="h-screen bg-surface flex flex-col overflow-hidden relative">
        {renderScreen()}
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
