import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { useCLIMonitor } from './hooks/useCLIMonitor';
import ErrorBoundary from './components/ErrorBoundary';
import ToolDisconnectedOverlay from './components/ToolDisconnectedOverlay';
import FlowTestRunner from './components/FlowTestRunner';
import E2ETestRunner from './components/E2ETestRunner';
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
import PlanningChatsScreen from './screens/PlanningChatsScreen';
import GitHistoryScreen from './screens/GitHistoryScreen';
import ProjectLayout from './components/ProjectLayout';

function App() {
  const { screen, initialize, isLoading, error } = useAppStore();
  const { shouldBlock } = useCLIMonitor();
  const [showFlowTest, setShowFlowTest] = useState(false);
  const [showE2ETest, setShowE2ETest] = useState(false);

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
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Expose E2E test trigger for HomeScreen settings menu
  useEffect(() => {
    (window as unknown as { openE2ETest?: () => void }).openE2ETest = () => setShowE2ETest(true);
    return () => {
      delete (window as unknown as { openE2ETest?: () => void }).openE2ETest;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-charcoal-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-terracotta-500 mx-auto"></div>
          <p className="mt-4 text-charcoal-300">Loading Forge...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-charcoal-900">
        <div className="text-center p-8 bg-charcoal-800 rounded-lg shadow-lg max-w-md border border-charcoal-700">
          <div className="text-rust-500 text-5xl mb-4">!</div>
          <h2 className="text-xl font-semibold text-cream-100 mb-2">Something went wrong</h2>
          <p className="text-charcoal-300 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-terracotta-500 text-cream-50 rounded-lg hover:bg-terracotta-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const renderProjectScreen = () => {
    switch (screen) {
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
      case 'planning-chats':
        return <PlanningChatsScreen />;
      case 'git-history':
        return <GitHistoryScreen />;
      default:
        return <HomeScreen />;
    }
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
      <div className="h-screen bg-charcoal-900 flex flex-col overflow-hidden relative">
        {renderScreen()}
        {shouldBlock && <ToolDisconnectedOverlay />}
        {showFlowTest && <FlowTestRunner onClose={() => setShowFlowTest(false)} />}
        {showE2ETest && <E2ETestRunner onClose={() => setShowE2ETest(false)} />}
      </div>
    </ErrorBoundary>
  );
}

export default App;
