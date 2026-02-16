import houstonAvatar from '../assets/houston-avatar.webp';

interface HoustonCalloutProps {
  message: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
}

export default function HoustonCallout({ message, ctaLabel, onCtaClick }: HoustonCalloutProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 mb-4 rounded-full overflow-hidden border-[3px] border-spectrum-blue shadow-glow-blue">
        <img src={houstonAvatar} alt="Houston" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
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
    </div>
  );
}
