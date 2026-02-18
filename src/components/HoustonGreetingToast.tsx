import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../store/ProjectStoreContext';
import houstonAvatar from '../assets/houston-avatar.webp';

export default function HoustonGreetingToast() {
  const houstonGreeting = useProjectStore((s) => s.houstonGreeting);
  const clearHoustonGreeting = useProjectStore((s) => s.clearHoustonGreeting);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const [dismissing, setDismissing] = useState(false);
  const [hovered, setHovered] = useState(false);

  const dismiss = () => {
    setDismissing(true);
    setTimeout(() => {
      clearHoustonGreeting();
      setDismissing(false);
    }, 250); // matches slide-out-left duration
  };

  useEffect(() => {
    if (!houstonGreeting || hovered) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(dismiss, 5000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [houstonGreeting, hovered]);

  // Reset dismissing state when new greeting arrives
  useEffect(() => {
    if (houstonGreeting) setDismissing(false);
  }, [houstonGreeting]);

  if (!houstonGreeting) return null;

  return (
    <div
      className={`fixed top-4 left-4 w-80 z-50 ${dismissing ? 'animate-slide-out-left' : 'animate-slide-in-left'}`}
      onMouseEnter={() => {
        setHovered(true);
        if (timerRef.current) clearTimeout(timerRef.current);
      }}
      onMouseLeave={() => {
        setHovered(false);
        timerRef.current = setTimeout(dismiss, 3000);
      }}
    >
      <div className="card-panel border-l-4 border-l-spectrum-blue p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-spectrum-blue flex-shrink-0">
            <img src={houstonAvatar} alt="Houston" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-mono text-ink-muted uppercase tracking-wider mb-0.5">Houston</p>
            <p className="text-sm font-medium text-ink leading-snug">{houstonGreeting}</p>
          </div>

          <button
            onClick={dismiss}
            className="text-ink-muted hover:text-ink flex-shrink-0 mt-0.5 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
