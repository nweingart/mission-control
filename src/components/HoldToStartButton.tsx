import { useState, useRef, useCallback } from 'react';

interface HoldToStartButtonProps {
  onStart: () => void;
  label?: string;
  holdDuration?: number;
  disabled?: boolean;
  className?: string;
}

export default function HoldToStartButton({
  onStart,
  label = 'Hold to Start',
  holdDuration = 1000,
  disabled = false,
  className = '',
}: HoldToStartButtonProps) {
  const [holding, setHolding] = useState(false);
  const [started, setStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const updateProgress = useCallback(() => {
    if (!progressRef.current || !startTimeRef.current) return;
    const elapsed = Date.now() - startTimeRef.current;
    const pct = Math.min((elapsed / holdDuration) * 100, 100);
    progressRef.current.style.width = `${pct}%`;
    if (pct < 100) {
      animFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, [holdDuration]);

  const handleStart = () => {
    if (disabled || started) return;
    setHolding(true);
    startTimeRef.current = Date.now();
    animFrameRef.current = requestAnimationFrame(updateProgress);

    timerRef.current = setTimeout(() => {
      setHolding(false);
      setStarted(true);
      cancelAnimationFrame(animFrameRef.current);
      if (progressRef.current) progressRef.current.style.width = '100%';
      onStart();
      // Reset started state after flash
      setTimeout(() => setStarted(false), 1500);
    }, holdDuration);
  };

  const handleEnd = () => {
    if (!holding) return;
    setHolding(false);
    cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Reset fill
    if (progressRef.current) progressRef.current.style.width = '0%';
    startTimeRef.current = 0;
  };

  return (
    <button
      onMouseDown={handleStart}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      disabled={disabled}
      className={`relative overflow-hidden select-none ${
        started
          ? 'btn-solid-success animate-start-flash'
          : 'btn-solid-primary'
      } flex items-center justify-center gap-2 px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {/* Fill bar */}
      <div
        ref={progressRef}
        className={`absolute left-0 top-0 h-full transition-none ${
          started ? 'bg-spectrum-green/30' : 'bg-white/15'
        }`}
        style={{ width: '0%' }}
      />

      {/* Content */}
      <span className="relative z-10 flex items-center gap-2">
        {/* Play/start icon */}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 3l14 9-14 9V3z"
          />
        </svg>
        <span className="font-semibold">
          {started ? 'Build started!' : holding ? 'Starting...' : label}
        </span>
      </span>
    </button>
  );
}
