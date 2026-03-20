import type { BacklogItem } from '../types';

export type SprintReadiness = {
  total: number;
  complete: number;
  generating: number;
  pending: number;
  failed: number;
  isReady: boolean;
  isBlocked: boolean;
  isInProgress: boolean;
  blockReason: string | null;
};

export function getSprintReadiness(items: BacklogItem[]): SprintReadiness {
  const total = items.length;
  let complete = 0;
  let generating = 0;
  let pending = 0;
  let failed = 0;

  for (const item of items) {
    switch (item.prdStatus) {
      case 'complete':
        complete++;
        break;
      case 'generating':
        generating++;
        break;
      case 'failed':
        failed++;
        break;
      default:
        pending++;
        break;
    }
  }

  const isReady = total > 0 && complete === total;
  const isBlocked = failed > 0;
  const isInProgress = generating > 0;

  let blockReason: string | null = null;
  if (total === 0) {
    blockReason = 'No items in this sprint';
  } else if (failed > 0) {
    blockReason = `${failed} ${failed === 1 ? 'item' : 'items'} failed planning — retry needed`;
  } else if (generating > 0) {
    blockReason = `${generating} ${generating === 1 ? 'item' : 'items'} still planning...`;
  } else if (pending > 0) {
    blockReason = `${pending} ${pending === 1 ? 'item' : 'items'} not yet planned`;
  }

  return { total, complete, generating, pending, failed, isReady, isBlocked, isInProgress, blockReason };
}
