interface OnboardingWelcomeProps {
  onNext: () => void;
}

const PIPELINE_STAGES = [
  'Idea',
  'Discovery',
  'PRD',
  'Plan',
  'Build',
  'Preview',
  'Deploy',
];

export default function OnboardingWelcome({ onNext }: OnboardingWelcomeProps) {
  return (
    <div className="max-w-lg text-center flex flex-col items-center">
      {/* Title */}
      <h1 className="font-display text-2xl tracking-wide font-bold text-secondary mb-6 flex items-center gap-2">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13.13 22.19L11.5 18.36C13.07 17.78 14.54 17 15.9 16.09L13.13 22.19M5.64 12.5L1.81 10.87L7.91 8.1C7 9.46 6.22 10.93 5.64 12.5M21.61 2.39C21.61 2.39 16.66 .269 11 5.93C8.81 8.12 7.5 10.53 6.65 12.64C6.37 13.39 6.56 14.21 7.11 14.77L9.24 16.89C9.79 17.45 10.61 17.63 11.36 17.35C13.5 16.53 15.88 15.19 18.07 13C23.73 7.34 21.61 2.39 21.61 2.39M14.54 9.46C13.76 8.68 13.76 7.41 14.54 6.63S16.59 5.85 17.37 6.63C18.14 7.41 18.15 8.68 17.37 9.46C16.59 10.24 15.32 10.24 14.54 9.46M8.88 16.53L7.47 15.12L8.88 16.53M6.24 22L9.88 18.36C9.54 18.27 9.21 18.12 8.91 17.91L4.83 22H6.24M2 22H3.41L8.18 17.24L6.76 15.83L2 20.59V22M2 19.17L6.09 15.09C5.88 14.79 5.73 14.46 5.64 14.12L2 17.76V19.17Z" />
        </svg>
        Houston
      </h1>

      {/* Description */}
      <p className="text-ink-secondary mb-10 leading-relaxed text-sm">
        Describe what you want to build, and Houston will help you refine the concept,
        generate a plan, write all the code, and deploy it live.
      </p>

      {/* Mini pipeline graphic */}
      <div className="flex items-center mb-10 overflow-x-auto">
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={stage} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 bg-accent" />
              <span className="text-xs text-ink-muted mt-1.5 whitespace-nowrap">{stage}</span>
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <div className="w-8 h-px bg-border mx-1 -mt-4" />
            )}
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={onNext}
        className="btn-solid-primary text-sm px-8 py-3"
      >
        GET STARTED
      </button>
    </div>
  );
}
