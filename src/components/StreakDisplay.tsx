import { useProjectStore } from '../store/ProjectStoreContext';
import type { MissionRank } from '../types';

const rankColors: Record<MissionRank, string> = {
  'Cadet': 'text-ink-muted',
  'Flight Controller': 'text-houston-blue',
  'Mission Specialist': 'text-houston-amber',
  'Mission Commander': 'text-houston-red',
  'Houston Actual': 'text-houston-green',
};

export default function StreakDisplay() {
  const gamification = useProjectStore((s) => s.gamification);
  const getMissionRank = useProjectStore((s) => s.getMissionRank);
  const rank = getMissionRank();

  return (
    <div className="flex items-center gap-3 text-xs font-mono no-drag">
      {/* Streak */}
      <div className="flex items-center gap-1">
        <svg className="w-3.5 h-3.5 text-houston-amber" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 23c-3.866 0-7-3.358-7-7.5 0-3.032 2.019-6.296 4.5-8.5L12 5l2.5 2c2.481 2.204 4.5 5.468 4.5 8.5 0 4.142-3.134 7.5-7 7.5zm0-2c2.761 0 5-2.462 5-5.5 0-2.268-1.574-4.87-3.5-6.5L12 7.5l-1.5 1.5C8.574 10.63 7 13.232 7 15.5 7 18.538 9.239 21 12 21z" />
        </svg>
        <span className="font-bold tabular-nums">{gamification.streakCount}</span>
      </div>

      {/* Divider */}
      <div className="w-px h-3.5 bg-border" />

      {/* Rank badge */}
      <span className={`font-medium ${rankColors[rank]}`}>{rank}</span>

      {/* Divider */}
      <div className="w-px h-3.5 bg-border" />

      {/* Launch counter */}
      <div className="flex items-center gap-1">
        <svg className="w-3.5 h-3.5 text-houston-red" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
          <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 3 0 3 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-3 0-3" />
        </svg>
        <span className="tabular-nums">{gamification.totalLaunches}</span>
        <span className="text-ink-muted">Launches</span>
      </div>
    </div>
  );
}
