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
      {/* Logo - Crossed Hammers */}
      <div className="mb-6">
        <svg className="w-24 h-24" viewBox="0 0 200 200">
          <defs>
            <linearGradient id="coralGradOnboard" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#E8927C' }} />
              <stop offset="100%" style={{ stopColor: '#D4806A' }} />
            </linearGradient>
            <linearGradient id="handleGradOnboard" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: '#8B7355' }} />
              <stop offset="50%" style={{ stopColor: '#9C8465' }} />
              <stop offset="100%" style={{ stopColor: '#8B7355' }} />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="95" fill="#1E1E1E" stroke="#E8927C" strokeWidth="3" />
          <g transform="rotate(-40, 100, 100)">
            <rect x="92" y="55" width="16" height="110" rx="3" fill="url(#handleGradOnboard)" stroke="#6B5D4D" strokeWidth="1" />
            <line x1="94" y1="130" x2="106" y2="130" stroke="#6B5D4D" strokeWidth="1" />
            <line x1="94" y1="140" x2="106" y2="140" stroke="#6B5D4D" strokeWidth="1" />
            <line x1="94" y1="150" x2="106" y2="150" stroke="#6B5D4D" strokeWidth="1" />
            <rect x="70" y="35" width="60" height="28" rx="4" fill="url(#coralGradOnboard)" stroke="#C97563" strokeWidth="1.5" />
            <rect x="73" y="38" width="54" height="6" rx="2" fill="#F2A896" opacity="0.5" />
          </g>
          <g transform="rotate(40, 100, 100)">
            <rect x="92" y="55" width="16" height="110" rx="3" fill="url(#handleGradOnboard)" stroke="#6B5D4D" strokeWidth="1" />
            <line x1="94" y1="130" x2="106" y2="130" stroke="#6B5D4D" strokeWidth="1" />
            <line x1="94" y1="140" x2="106" y2="140" stroke="#6B5D4D" strokeWidth="1" />
            <line x1="94" y1="150" x2="106" y2="150" stroke="#6B5D4D" strokeWidth="1" />
            <rect x="70" y="35" width="60" height="28" rx="4" fill="url(#coralGradOnboard)" stroke="#C97563" strokeWidth="1.5" />
            <rect x="73" y="38" width="54" height="6" rx="2" fill="#F2A896" opacity="0.5" />
          </g>
        </svg>
      </div>

      {/* Title */}
      <h1 className="text-5xl font-logo font-semibold tracking-tight text-cream-100 mb-6">Forge</h1>

      {/* Description */}
      <p className="text-charcoal-200 mb-10 leading-relaxed">
        Describe what you want to build, and Forge will help you refine the concept,
        generate a plan, write all the code, and deploy it live.
      </p>

      {/* Mini pipeline graphic */}
      <div className="flex items-center mb-10 overflow-x-auto">
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={stage} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-terracotta-500/80" />
              <span className="text-xs text-charcoal-400 mt-1.5 whitespace-nowrap">{stage}</span>
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <div className="w-8 h-px bg-charcoal-600 mx-1 -mt-4" />
            )}
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={onNext}
        className="px-8 py-3 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 transition-colors font-semibold text-lg"
      >
        Get Started
      </button>
    </div>
  );
}
