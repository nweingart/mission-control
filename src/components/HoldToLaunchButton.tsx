import { useState, useRef, useCallback } from 'react';

interface HoldToLaunchButtonProps {
  onLaunch: () => void;
  label?: string;
  holdDuration?: number;
  disabled?: boolean;
  className?: string;
}

export default function HoldToLaunchButton({
  onLaunch,
  label = 'Hold to Launch',
  holdDuration = 1000,
  disabled = false,
  className = '',
}: HoldToLaunchButtonProps) {
  const [holding, setHolding] = useState(false);
  const [launched, setLaunched] = useState(false);
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
    if (disabled || launched) return;
    setHolding(true);
    startTimeRef.current = Date.now();
    animFrameRef.current = requestAnimationFrame(updateProgress);

    timerRef.current = setTimeout(() => {
      setHolding(false);
      setLaunched(true);
      cancelAnimationFrame(animFrameRef.current);
      if (progressRef.current) progressRef.current.style.width = '100%';
      onLaunch();
      // Reset launched state after flash
      setTimeout(() => setLaunched(false), 1500);
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
        launched
          ? 'btn-solid-success animate-launch-flash'
          : 'btn-solid-primary'
      } flex items-center justify-center gap-2 px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {/* Fill bar */}
      <div
        ref={progressRef}
        className={`absolute left-0 top-0 h-full transition-none ${
          launched ? 'bg-spectrum-green/30' : 'bg-white/15'
        }`}
        style={{ width: '0%' }}
      />

      {/* Content */}
      <span className="relative z-10 flex items-center gap-2">
        {/* Rocket icon */}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <span className="font-semibold">
          {launched ? 'We have liftoff!' : holding ? 'Launching...' : label}
        </span>
      </span>
    </button>
  );
}
