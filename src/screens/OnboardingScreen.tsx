import { useState } from 'react';
import StageIntro from '../components/onboarding/StageIntro';
import StageHouston from '../components/onboarding/StageHouston';
import StageWorkspace from '../components/onboarding/StageWorkspace';
import StageLaunch from '../components/onboarding/StageLaunch';

type Stage = 0 | 1 | 2 | 3;

// Always start at the beginning — the full flow has value even if tools are already set up
function deriveInitialStage(): Stage {
  return 0;
}

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

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Drag region + progress bar (hidden on intro splash) */}
      <div className="h-14 drag-region flex items-end justify-center pb-2">
        {stage > 0 && <ProgressBar current={stage} total={3} />}
      </div>

      {/* Stage content */}
      <main className="flex-1 overflow-y-auto flex items-center justify-center p-8">
        {stage === 0 && <StageIntro onComplete={() => setStage(1)} />}
        {stage === 1 && <StageHouston onComplete={() => setStage(2)} />}
        {stage === 2 && <StageWorkspace onComplete={() => setStage(3)} />}
        {stage === 3 && <StageLaunch />}
      </main>
    </div>
  );
}
