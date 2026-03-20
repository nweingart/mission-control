import { useState, useEffect, useRef } from 'react';

interface ProgressRingProps {
  completed: number;
  total: number;
  size?: number;
  strokeWidth?: number;
}

export default function ProgressRing({ completed, total, size = 48, strokeWidth = 3 }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.min(completed / total, 1) : 0;
  const offset = circumference * (1 - progress);
  const isComplete = total > 0 && completed >= total;
  const [justCompleted, setJustCompleted] = useState(false);
  const prevCompleteRef = useRef(isComplete);

  // Detect transition to complete for scale pulse
  useEffect(() => {
    if (isComplete && !prevCompleteRef.current) {
      setJustCompleted(true);
      const timer = setTimeout(() => setJustCompleted(false), 800);
      prevCompleteRef.current = isComplete;
      return () => clearTimeout(timer);
    }
    prevCompleteRef.current = isComplete;
  }, [isComplete]);

  const strokeColor = isComplete ? 'rgb(var(--color-spectrum-green))' : 'rgb(var(--color-accent))';

  return (
    <div
      className={`relative flex-shrink-0 ${justCompleted ? 'animate-sprint-complete' : ''}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={completed}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${completed} of ${total} complete`}
    >
      <svg width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--color-border))"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        {progress > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-600 ease-out"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
        )}
      </svg>
      {/* Green glow when complete */}
      {isComplete && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ boxShadow: '0 0 12px rgba(74, 222, 128, 0.3)' }}
        />
      )}
      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isComplete ? (
          <svg className="w-4 h-4 text-spectrum-green" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <span className="text-[11px] font-mono font-semibold text-ink-secondary">
            {completed}/{total}
          </span>
        )}
      </div>
    </div>
  );
}
