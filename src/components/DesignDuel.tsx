import { useState } from 'react';
import { useProjectStore } from '../store/ProjectStoreContext';
import { DESIGN_QUESTIONS, buildDesignTaskDescription } from '../constants/design-questions';
import type { PreviewStyles } from '../constants/design-questions';
import type { DesignPreferences } from '../types';
import houstonAvatar from '../assets/houston-avatar.webp';

interface DesignDuelProps {
  onClose: () => void;
}

function MiniPreview({ styles, spacious }: { styles: PreviewStyles; spacious?: boolean }) {
  const pad = spacious ? '16px' : '10px';
  const gap = spacious ? '12px' : '6px';

  return (
    <div
      style={{
        background: styles.background,
        borderRadius: styles.borderRadius,
        padding: pad,
        fontFamily: styles.fontFamily,
        color: styles.text,
        width: '100%',
        height: '160px',
        display: 'flex',
        flexDirection: 'column',
        gap,
        overflow: 'hidden',
        border: `1px solid ${styles.border}`,
        boxShadow: styles.shadow,
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 600 }}>Welcome back</div>
      <div
        style={{
          background: styles.inputBg,
          border: `1px solid ${styles.border}`,
          borderRadius: styles.borderRadius,
          padding: '6px 10px',
          fontSize: '11px',
          color: styles.text,
          opacity: 0.5,
        }}
      >
        Search...
      </div>
      <div
        style={{
          background: styles.cardBg,
          border: `1px solid ${styles.border}`,
          borderRadius: styles.borderRadius,
          padding: spacious ? '10px' : '6px',
          fontSize: '10px',
          boxShadow: styles.shadow !== 'none' ? styles.shadow : undefined,
        }}
      >
        <div style={{ fontWeight: 500, marginBottom: '2px' }}>Dashboard</div>
        <div style={{ opacity: 0.6, fontSize: '9px' }}>3 items updated</div>
      </div>
      <div
        style={{
          background: styles.accent,
          color: styles.accentText,
          borderRadius: styles.borderRadius,
          padding: '5px 12px',
          fontSize: '11px',
          fontWeight: 600,
          textAlign: 'center',
          marginTop: 'auto',
          cursor: 'default',
        }}
      >
        Get Started
      </div>
    </div>
  );
}

export default function DesignDuel({ onClose }: DesignDuelProps) {
  const { updateProject, addToast, tasks, setTasks } = useProjectStore();

  const [phase, setPhase] = useState<'intro' | 'questions' | 'generating' | 'done'>('intro');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<DesignPreferences>>({});
  const [fadeKey, setFadeKey] = useState(0);

  const handleChoice = (value: string) => {
    const question = DESIGN_QUESTIONS[currentIndex];
    const newAnswers = { ...answers, [question.id]: value };
    setAnswers(newAnswers);

    if (currentIndex < DESIGN_QUESTIONS.length - 1) {
      setFadeKey((k) => k + 1);
      setCurrentIndex((i) => i + 1);
    } else {
      handleComplete(newAnswers as DesignPreferences);
    }
  };

  const handleComplete = async (prefs: DesignPreferences) => {
    setPhase('generating');
    await updateProject({ designPreferences: prefs });

    const designTask = {
      id: `task-design-${Date.now()}`,
      title: 'Apply design system from Design Duel preferences',
      description: buildDesignTaskDescription(prefs),
      completed: false,
    };
    setTasks([...tasks, designTask]);

    addToast({ type: 'success' as const, message: 'Design preferences saved! Design task queued.' });
    setPhase('done');
    setTimeout(onClose, 1500);
  };

  const question = DESIGN_QUESTIONS[currentIndex];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="bg-surface-card border border-border relative"
        style={{ width: '640px', maxWidth: '95vw', borderRadius: '12px', overflow: 'hidden' }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-ink-muted hover:text-ink transition-colors z-10"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* INTRO phase */}
        {phase === 'intro' && (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-accent mb-4">
              <img src={houstonAvatar} alt="Houston" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">Design Duel</h2>
            <p className="text-sm text-ink-muted mb-6 max-w-sm">
              While your app builds, let's pick your design style. 10 quick A/B choices — Houston will generate a
              tailored design system for your project.
            </p>
            <button
              onClick={() => setPhase('questions')}
              className="btn-solid-primary px-6 py-2 text-sm font-medium"
            >
              Let's Go
            </button>
          </div>
        )}

        {/* QUESTIONS phase */}
        {phase === 'questions' && (
          <div className="p-6">
            <div className="text-center mb-5">
              <h2 className="text-lg font-bold text-ink">{question.title}</h2>
              <p className="text-sm text-ink-muted">{question.subtitle}</p>
            </div>

            <div
              key={fadeKey}
              className="flex gap-4"
              style={{ animation: 'designDuelFadeIn 0.25s ease-out' }}
            >
              {/* Option A */}
              <button
                onClick={() => handleChoice(question.optionA.value)}
                className="flex-1 border border-border hover:border-accent transition-colors cursor-pointer bg-surface"
                style={{ borderRadius: '10px', padding: '12px', textAlign: 'left' }}
              >
                <MiniPreview
                  styles={question.optionA.styles}
                  spacious={question.id === 'spacing' ? true : undefined}
                />
                <div className="text-sm font-medium text-ink mt-3 text-center">
                  {question.optionA.label}
                </div>
              </button>

              {/* Option B */}
              <button
                onClick={() => handleChoice(question.optionB.value)}
                className="flex-1 border border-border hover:border-accent transition-colors cursor-pointer bg-surface"
                style={{ borderRadius: '10px', padding: '12px', textAlign: 'left' }}
              >
                <MiniPreview
                  styles={question.optionB.styles}
                  spacious={question.id === 'spacing' ? false : undefined}
                />
                <div className="text-sm font-medium text-ink mt-3 text-center">
                  {question.optionB.label}
                </div>
              </button>
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-2 mt-5">
              {DESIGN_QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className="transition-all duration-200"
                  style={{
                    width: i === currentIndex ? '20px' : '8px',
                    height: '8px',
                    borderRadius: '4px',
                    backgroundColor:
                      i < currentIndex
                        ? 'var(--color-accent)'
                        : i === currentIndex
                        ? 'var(--color-accent)'
                        : 'var(--color-border)',
                    opacity: i < currentIndex ? 0.5 : 1,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* GENERATING phase */}
        {phase === 'generating' && (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
            <h2 className="text-lg font-bold text-ink mb-1">Applying your design...</h2>
            <p className="text-sm text-ink-muted">Adding design task to your build queue.</p>
          </div>
        )}

        {/* DONE phase */}
        {phase === 'done' && (
          <div className="p-8 flex flex-col items-center text-center">
            <svg className="w-12 h-12 text-success mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-lg font-bold text-ink">Design choices saved!</h2>
          </div>
        )}
      </div>

      {/* Fade-in animation */}
      <style>{`
        @keyframes designDuelFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
