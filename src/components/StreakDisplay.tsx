import { useProjectStore } from '../store/ProjectStoreContext';
import type { UserRank } from '../types';

const rankColors: Record<UserRank, string> = {
  'Beginner': 'text-ink-muted',
  'Contributor': 'text-mc-green',
  'Builder': 'text-mc-amber',
  'Lead': 'text-mc-red',
  'Expert': 'text-mc-green',
};

export default function StreakDisplay() {
  const gamification = useProjectStore((s) => s.gamification);
  const getUserRank = useProjectStore((s) => s.getUserRank);
  const rank = getUserRank();

  return (
    <div className="flex items-center gap-3 text-xs font-mono no-drag">
      {/* Streak */}
      <div className="flex items-center gap-1">
        <svg className="w-3.5 h-3.5 text-mc-amber" viewBox="0 0 24 24" fill="currentColor">
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

      {/* Build counter */}
      <div className="flex items-center gap-1">
        <svg className="w-3.5 h-3.5 text-mc-red" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
          <path d="M22 4L12 14.01l-3-3" />
        </svg>
        <span className="tabular-nums">{gamification.totalBuilds}</span>
        <span className="text-ink-muted">Builds</span>
      </div>
    </div>
  );
}
