import { useProjectStore } from '../store/ProjectStoreContext';
import ProjectHomeScreen from '../screens/ProjectHomeScreen';
import BuildScreen from '../screens/BuildScreen';
import ScanningScreen from '../screens/ScanningScreen';
import DocsScreen from '../screens/DocsScreen';
import IssuesScreen from '../screens/IssuesScreen';
import GitHistoryScreen from '../screens/GitHistoryScreen';
import DeploymentsScreen from '../screens/DeploymentsScreen';
import DatabaseScreen from '../screens/DatabaseScreen';

function ActiveScreen() {
  const screen = useProjectStore(s => s.screen);

  switch (screen) {
    case 'project-home':
      return <ProjectHomeScreen />;
    case 'docs':
      return <DocsScreen />;
    case 'issues':
      return <IssuesScreen />;
    case 'scanning':
      return <ScanningScreen />;
    case 'planning':
    case 'planning-chats':
      return <ProjectHomeScreen />;
    case 'building':
      return <BuildScreen />;
    case 'git-history':
      return <GitHistoryScreen />;
    case 'deployments':
      return <DeploymentsScreen />;
    case 'database':
      return <DatabaseScreen />;
    default:
      return <ProjectHomeScreen />;
  }
}

export default function ProjectScreenRouter() {
  const currentProject = useProjectStore(s => s.currentProject);
  const screen = useProjectStore(s => s.screen);

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
      {!showBuild && <ActiveScreen />}
    </>
  );
}
