import { useEffect, useRef, useState } from 'react';

export interface DiscoveryCardProps {
  type: 'issue' | 'techStack' | 'feature' | 'featureIdea';
  title: string;
  description?: string;
  severity?: 'critical' | 'warning' | 'info';
  category?: string;
  file?: string;
  isNew?: boolean;
  // For techStack type
  languages?: string[];
  frameworks?: string[];
  buildTools?: string[];
}

const severityDot: Record<string, string> = {
  critical: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-ink-muted/40',
};

const categoryBadge: Record<string, string> = {
  bug: 'bg-spectrum-orange/15 text-spectrum-orange border-spectrum-orange/30',
  security: 'bg-spectrum-red/15 text-spectrum-red border-spectrum-red/30',
  performance: 'bg-accent/15 text-accent border-accent/30',
  dead_code: 'bg-surface-light text-ink-muted border-border',
};

export default function DiscoveryCard({
  type,
  title,
  description,
  severity,
  category,
  file,
  isNew = false,
  languages,
  frameworks,
  buildTools,
}: DiscoveryCardProps) {
  const [visible, setVisible] = useState(!isNew);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (isNew && !hasAnimated.current) {
      hasAnimated.current = true;
      // Double-rAF to ensure the browser paints with opacity:0 first
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    }
  }, [isNew]);

  if (type === 'techStack') {
    return (
      <div
        className="card-panel p-3 mb-2 transition-all duration-300"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-semibold text-ink">Tech Stack</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {languages?.map((lang) => (
            <span key={lang} className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 border rounded bg-accent/15 text-accent border-accent/30">
              {lang}
            </span>
          ))}
          {frameworks?.map((fw) => (
            <span key={fw} className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 border rounded bg-accent/15 text-accent border-accent/30">
              {fw}
            </span>
          ))}
          {buildTools?.map((bt) => (
            <span key={bt} className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 border rounded bg-spectrum-purple/15 text-spectrum-purple border-spectrum-purple/30">
              {bt}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const badgeClass = category ? (categoryBadge[category] || categoryBadge.bug) : '';

  return (
    <div
      className="card-panel p-3 mb-2 transition-all duration-300"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
      }}
    >
      <div className="flex items-start gap-2">
        {severity && severityDot[severity] && (
          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${severityDot[severity]}`} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-ink">{title}</span>
            {category && (
              <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 border rounded ${badgeClass}`}>
                {category.replaceAll('_', ' ')}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-ink-muted mt-1 line-clamp-2">{description}</p>
          )}
          {file && (
            <p className="text-xs text-ink-muted font-mono mt-1 truncate">{file}</p>
          )}
        </div>
      </div>
    </div>
  );
}
