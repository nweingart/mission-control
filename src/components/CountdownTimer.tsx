import { useState, useEffect } from 'react';

interface CountdownTimerProps {
  deadline: string;
}

function formatCountdown(ms: number): { text: string; urgency: 'normal' | 'warning' | 'critical' | 'overtime' } {
  if (ms <= 0) {
    const abs = Math.abs(ms);
    const days = Math.floor(abs / 86_400_000);
    const hours = Math.floor((abs % 86_400_000) / 3_600_000);
    return { text: `+${days}d ${hours}h`, urgency: 'overtime' };
  }

  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);

  if (days >= 3) {
    return { text: `${days}d ${hours}h`, urgency: 'normal' };
  }
  if (days >= 1) {
    return { text: `${days}d ${hours}h`, urgency: 'warning' };
  }
  if (hours > 0) {
    return { text: `${hours}h ${mins}m`, urgency: 'critical' };
  }
  return { text: `${mins}m`, urgency: 'critical' };
}

const urgencyStyles: Record<string, string> = {
  normal: 'text-ink-secondary',
  warning: 'text-mc-amber shadow-glow-amber',
  critical: 'text-mc-red animate-mc-blink',
  overtime: 'text-mc-red',
};

export default function CountdownTimer({ deadline }: CountdownTimerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const remaining = new Date(deadline).getTime() - now;
  const { text, urgency } = formatCountdown(remaining);

  return (
    <span className={`text-sm font-mono font-bold ${urgencyStyles[urgency]}`}>
      {text}
    </span>
  );
}
