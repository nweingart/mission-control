import type { TaskPhase } from '../types';

export type HoustonMood = 'celebrating' | 'alert' | 'working' | 'greeting' | 'idle';

interface MoodParams {
  gamificationEvent: { type: 'milestone' | 'rank_up'; label: string } | null;
  buildTaskPhase: TaskPhase;
  buildSessionActive: boolean;
  isLoading: boolean;
  isGreeting: boolean;
}

export function deriveHoustonMood(params: MoodParams): HoustonMood {
  if (params.gamificationEvent) return 'celebrating';
  if (params.buildTaskPhase === 'error') return 'alert';
  if (params.buildSessionActive || params.isLoading) return 'working';
  if (params.isGreeting) return 'greeting';
  return 'idle';
}

export function getMoodButtonClasses(mood: HoustonMood): string {
  switch (mood) {
    case 'celebrating':
      return 'border-houston-green shadow-glow-green animate-houston-bounce';
    case 'alert':
      return 'border-houston-red shadow-glow-red animate-houston-blink';
    case 'working':
      return 'border-spectrum-blue animate-houston-pulse';
    case 'greeting':
      return 'border-spectrum-blue shadow-glow-blue animate-houston-nod';
    case 'idle':
    default:
      return 'border-spectrum-blue shadow-glow-blue';
  }
}
