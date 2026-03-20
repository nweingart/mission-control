import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import StageIntro from '../components/onboarding/StageIntro';
import StageAssistant from '../components/onboarding/StageAssistant';
import StageWorkspace from '../components/onboarding/StageWorkspace';

type Stage = 0 | 1 | 2;

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1 w-48">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 transition-all duration-300 ${
            i + 1 <= current ? 'bg-accent' : 'bg-border'
          }`}
        />
      ))}
    </div>
  );
}

export default function OnboardingScreen() {
  const [stage, setStage] = useState<Stage>(0);
  const setScreen = useAppStore(s => s.setScreen);

  const handleWorkspaceComplete = () => {
    // Onboarding done — go to Home Screen (user imports a repo from there)
    setScreen('home');
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Drag region + progress bar (hidden on intro splash) */}
      <div className="h-14 drag-region flex items-end justify-center pb-2">
        {stage > 0 && <ProgressBar current={stage} total={2} />}
      </div>

      {/* Stage content */}
      <main className="flex-1 overflow-y-auto flex items-center justify-center p-8">
        {stage === 0 && <StageIntro onComplete={() => setStage(1)} />}
        {stage === 1 && <StageAssistant onComplete={() => setStage(2)} />}
        {stage === 2 && <StageWorkspace onComplete={handleWorkspaceComplete} />}
      </main>
    </div>
  );
}
