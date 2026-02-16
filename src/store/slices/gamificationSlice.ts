import { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';
import type { GamificationStats, MissionRank } from '../../types';

export interface GamificationSlice {
  gamification: GamificationStats;
  gamificationEvent: { type: 'milestone' | 'rank_up'; label: string } | null;

  loadGamification: () => Promise<void>;
  saveGamification: () => Promise<void>;
  recordActivity: (type: 'task_landed' | 'launch' | 'doc_written') => void;
  checkAndUpdateStreak: () => void;
  getMissionRank: () => MissionRank;
  clearGamificationEvent: () => void;
}

export const GAMIFICATION_INITIAL_STATE = {
  gamification: {
    streakCount: 0,
    lastActivityDate: null,
    streakFreezeUsedThisWeek: false,
    lastFreezeWeek: null,
    totalTasksLanded: 0,
    totalLaunches: 0,
    milestones: [],
  } as GamificationStats,
  gamificationEvent: null as GamificationSlice['gamificationEvent'],
};

export const createGamificationSlice: StateCreator<AppState, [], [], GamificationSlice> = (set, get) => ({
  ...GAMIFICATION_INITIAL_STATE,

  loadGamification: async () => {
    const { currentProject } = get();
    if (currentProject) {
      try {
        const stats = await window.api.storage.getGamification(currentProject.slug);
        if (stats) {
          set({ gamification: stats });
        }
      } catch (err) {
        console.error('Failed to load gamification:', err);
      }
    }
  },

  saveGamification: async () => {
    const { currentProject, gamification } = get();
    if (currentProject) {
      try {
        await window.api.storage.saveGamification(currentProject.slug, gamification);
      } catch (err) {
        console.error('Failed to save gamification:', err);
      }
    }
  },

  checkAndUpdateStreak: () => {
    const { gamification } = get();
    const today = new Date().toISOString().slice(0, 10);

    if (!gamification.lastActivityDate) return;
    if (gamification.lastActivityDate === today) return;

    const last = new Date(gamification.lastActivityDate);
    const now = new Date(today);
    const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return;
    }

    const getISOWeek = (d: Date): string => {
      const date = new Date(d.getTime());
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
      const week1 = new Date(date.getFullYear(), 0, 4);
      const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
      return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    };

    const currentWeek = getISOWeek(now);

    if (diffDays === 2) {
      const isNewWeek = gamification.lastFreezeWeek !== currentWeek;
      const freezeAvailable = isNewWeek || !gamification.streakFreezeUsedThisWeek;

      if (freezeAvailable) {
        set({
          gamification: {
            ...gamification,
            streakFreezeUsedThisWeek: true,
            lastFreezeWeek: currentWeek,
          },
        });
        get().saveGamification();
        return;
      }
    }

    set({
      gamification: {
        ...gamification,
        streakCount: 0,
        streakFreezeUsedThisWeek: false,
      },
    });
    get().saveGamification();
  },

  recordActivity: (type) => {
    const { gamification, currentProject } = get();
    if (!currentProject) return;

    const today = new Date().toISOString().slice(0, 10);
    const isNewDay = gamification.lastActivityDate !== today;

    const updated: GamificationStats = {
      ...gamification,
      lastActivityDate: today,
      streakCount: isNewDay ? gamification.streakCount + 1 : gamification.streakCount,
      totalTasksLanded: type === 'task_landed' ? gamification.totalTasksLanded + 1 : gamification.totalTasksLanded,
      totalLaunches: type === 'launch' ? gamification.totalLaunches + 1 : gamification.totalLaunches,
    };

    const newMilestones = [...updated.milestones];
    let event: { type: 'milestone' | 'rank_up'; label: string } | null = null;

    for (const threshold of [7, 14, 30]) {
      const key = `streak-${threshold}`;
      if (updated.streakCount >= threshold && !newMilestones.includes(key)) {
        newMilestones.push(key);
        event = { type: 'milestone', label: `${threshold}-Day Streak!` };
      }
    }

    const prevRank = get().getMissionRank();
    updated.milestones = newMilestones;

    set({ gamification: updated });
    const newRank = get().getMissionRank();

    if (newRank !== prevRank) {
      const rankKey = `rank-${newRank.toLowerCase().replace(/\s+/g, '-')}`;
      if (!newMilestones.includes(rankKey)) {
        newMilestones.push(rankKey);
      }
      event = { type: 'rank_up', label: `Promoted to ${newRank}!` };
    }

    updated.milestones = newMilestones;
    set({ gamification: updated, gamificationEvent: event });

    window.api.storage.saveGamification(currentProject.slug, updated).catch((err) => {
      console.error('Failed to save gamification:', err);
    });
  },

  getMissionRank: (): MissionRank => {
    const { gamification } = get();
    const { totalTasksLanded, totalLaunches, streakCount } = gamification;

    if (totalTasksLanded >= 200 && totalLaunches >= 50 && streakCount >= 30) return 'Houston Actual';
    if (totalTasksLanded >= 100 && totalLaunches >= 20 && streakCount >= 14) return 'Mission Commander';
    if (totalTasksLanded >= 50 && totalLaunches >= 5) return 'Mission Specialist';
    if (totalTasksLanded >= 10) return 'Flight Controller';
    return 'Cadet';
  },

  clearGamificationEvent: () => set({ gamificationEvent: null }),
});
