import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import OnboardingWelcome from '../components/onboarding/OnboardingWelcome';
import OnboardingWorkflow from '../components/onboarding/OnboardingWorkflow';

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center space-x-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i + 1 === current
              ? 'w-6 h-2 bg-terracotta-500'
              : i + 1 < current
                ? 'w-2 h-2 bg-terracotta-500/50'
                : 'w-2 h-2 bg-charcoal-600'
          }`}
        />
      ))}
    </div>
  );
}

export default function OnboardingScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const { completeOnboarding } = useAppStore();

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Drag region + step indicator */}
      <div className="h-14 drag-region flex items-end justify-center pb-2">
        <StepDots current={step} total={2} />
      </div>

      {/* Step content */}
      <main className="flex-1 overflow-y-auto flex items-center justify-center p-8">
        {step === 1 && <OnboardingWelcome onNext={() => setStep(2)} />}
        {step === 2 && <OnboardingWorkflow onNext={completeOnboarding} onBack={() => setStep(1)} />}
      </main>
    </div>
  );
}
