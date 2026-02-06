import { useAppStore } from '../store/useAppStore';

const TOOL_ICONS = [
  {
    name: 'Claude Code',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    name: 'GitHub',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
    ),
  },
  {
    name: 'Vercel',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 76 65" fill="currentColor">
        <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
      </svg>
    ),
  },
  {
    name: 'Supabase',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 109 113" fill="currentColor">
        <path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z" fillOpacity="0.7" />
        <path d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.041L54.4849 72.2922H9.83113C1.64038 72.2922 -2.92775 62.8321 2.1655 56.4175L45.317 2.07103Z" />
      </svg>
    ),
  },
];

export default function SetupReadyScreen() {
  const { setScreen, projects } = useAppStore();

  const handleComplete = () => {
    setScreen('home');
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Drag region */}
      <div className="h-14 drag-region" />

      {/* Content */}
      <main className="flex-1 overflow-y-auto flex items-center justify-center p-8">
        <div className="max-w-lg text-center flex flex-col items-center">
          {/* Checkmark */}
          <div className="w-20 h-20 rounded-full bg-sage-500/20 flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-sage-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>

          {/* Heading */}
          <h2 className="text-2xl font-bold text-cream-100 mb-4">You're All Set!</h2>

          {/* Tool icons row */}
          <div className="flex items-center justify-center space-x-4 mb-6">
            {TOOL_ICONS.map((tool) => (
              <div
                key={tool.name}
                className="relative w-10 h-10 rounded-lg bg-sage-500/15 text-sage-400 flex items-center justify-center"
                title={tool.name}
              >
                {tool.icon}
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-sage-500 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <p className="text-charcoal-200 mb-10 leading-relaxed whitespace-nowrap">
            Describe an idea, and Forge will help you design, build, and deploy it.
          </p>

          {/* CTA */}
          <button
            onClick={handleComplete}
            className="px-8 py-3 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 transition-colors font-semibold text-lg"
          >
            {projects.length > 0 ? 'Go to Projects' : 'Start Your First Project'}
          </button>
        </div>
      </main>
    </div>
  );
}
