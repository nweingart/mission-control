type BacklogStatus = 'todo' | 'in_progress' | 'done';

const statusLabels: Record<BacklogStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

interface StatusLightProps {
  status: BacklogStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export default function StatusLight({ status, showLabel = true, size = 'md' }: StatusLightProps) {
  const px = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';

  const lightClass = (() => {
    switch (status) {
      case 'todo':
        return `${px} rounded-full border border-ink-muted/40 bg-transparent`;
      case 'in_progress':
        return `${px} rounded-full bg-accent animate-pulse-glow`;
      case 'done':
        return `${px} rounded-full bg-spectrum-green`;
      default:
        return `${px} rounded-full border border-ink-muted/40`;
    }
  })();

  return (
    <span
      className="flex items-center gap-1.5"
      title={statusLabels[status]}
      role="status"
      aria-label={statusLabels[status]}
    >
      <span className={`flex-shrink-0 transition-all duration-300 ${lightClass}`} aria-hidden="true" />
      {showLabel && (
        <span className="text-xs font-display font-medium text-ink-muted">
          {statusLabels[status]}
        </span>
      )}
    </span>
  );
}

export { statusLabels };
export type { BacklogStatus };
