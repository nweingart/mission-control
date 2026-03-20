import mcAvatar from '../assets/mc-avatar.webp';

interface ActionButton {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

interface AssistantCalloutProps {
  message: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  actions?: ActionButton[];
}

export default function AssistantCallout({ message, ctaLabel, onCtaClick, actions }: AssistantCalloutProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 mb-4 rounded-full overflow-hidden border-[3px] border-accent shadow-glow-green">
        <img src={mcAvatar} alt="Assistant" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
      </div>
      <p className="text-sm text-ink-muted max-w-xs">{message}</p>
      {ctaLabel && onCtaClick && (
        <button
          onClick={onCtaClick}
          className="btn-solid-primary px-5 py-2 text-sm font-medium mt-4"
        >
          {ctaLabel}
        </button>
      )}
      {actions && actions.length > 0 && (
        <div className="flex items-center gap-3 mt-5">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={action.onClick}
              className={action.variant === 'secondary'
                ? 'btn-solid px-5 py-2.5 text-sm font-bold text-ink'
                : 'btn-solid-primary px-5 py-2.5 text-sm font-bold'
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
