interface ProgressBarProps {
  progress: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'yellow' | 'red';
}

export default function ProgressBar({
  progress,
  label,
  showPercentage = true,
  size = 'md',
  color = 'blue',
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-4',
  };

  const colorClasses = {
    blue: 'bg-accent',
    green: 'bg-success',
    yellow: 'bg-accent',
    red: 'bg-error',
  };

  const filledSegments = Math.round(clampedProgress / 10);

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex justify-between text-sm font-sans font-medium text-ink-secondary mb-1">
          {label && <span>{label}</span>}
          {showPercentage && <span>{Math.round(clampedProgress)}%</span>}
        </div>
      )}
      <div
        className={`w-full flex gap-1 ${sizeClasses[size]}`}
        role="progressbar"
        aria-valuenow={Math.round(clampedProgress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={`flex-1 ${sizeClasses[size]} transition-all duration-300 ease-out ${
              i < filledSegments ? colorClasses[color] : 'bg-border'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
