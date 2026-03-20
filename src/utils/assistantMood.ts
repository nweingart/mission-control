import type { TaskPhase } from '../types';

export type AssistantMood = 'celebrating' | 'alert' | 'working' | 'greeting' | 'idle';

interface MoodParams {
  gamificationEvent: { type: 'milestone' | 'rank_up'; label: string } | null;
  buildTaskPhase: TaskPhase;
  buildSessionActive: boolean;
  isLoading: boolean;
  isGreeting: boolean;
}

export function deriveAssistantMood(params: MoodParams): AssistantMood {
  if (params.gamificationEvent) return 'celebrating';
  if (params.buildTaskPhase === 'error') return 'alert';
  if (params.buildSessionActive || params.isLoading) return 'working';
  if (params.isGreeting) return 'greeting';
  return 'idle';
}

export function getMoodButtonClasses(mood: AssistantMood): string {
  switch (mood) {
    case 'celebrating':
      return 'border-mc-green shadow-glow-green animate-mc-bounce';
    case 'alert':
      return 'border-mc-red shadow-glow-red animate-mc-blink';
    case 'working':
      return 'border-accent animate-mc-pulse';
    case 'greeting':
      return 'border-accent shadow-glow-green animate-mc-nod';
    case 'idle':
    default:
      return 'border-accent shadow-glow-green';
  }
}
